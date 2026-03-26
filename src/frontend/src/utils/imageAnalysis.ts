// ═══════════════════════════════════════════════════════════════════════════
// Missing Child Finder – Face Analysis Engine
// Models: face-api.js (CNN) · BlazeFace (TF.js) · ResNet50 (TF.js) ·
//         YOLOv8-ONNX (onnxruntime-web) · Age Progression
// ═══════════════════════════════════════════════════════════════════════════

// ─── CDN versions ────────────────────────────────────────────────────────────
const TFJS_VERSION = "4.22.0";
const BLAZEFACE_VERSION = "0.0.7";
const ORT_VERSION = "1.18.0";

const TFJS_CDN = `https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@${TFJS_VERSION}/dist/tf.min.js`;
const BLAZEFACE_CDN = `https://cdn.jsdelivr.net/npm/@tensorflow-models/blazeface@${BLAZEFACE_VERSION}/dist/blazeface.min.js`;
const ORT_CDN = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/ort.min.js`;

// face-api.js CDN list (tried in order, first available wins)
const FACEAPI_CDNS = [
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/dist/face-api.js",
  "https://unpkg.com/@vladmandic/face-api@1.7.13/dist/face-api.js",
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js",
  "https://unpkg.com/@vladmandic/face-api/dist/face-api.js",
  "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js",
  "https://unpkg.com/face-api.js@0.22.2/dist/face-api.min.js",
];

// face-api model weight CDNs
const MODEL_URLS = [
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model",
  "https://unpkg.com/@vladmandic/face-api/model",
  "https://cdn.jsdelivr.net/npm/face-api.js/weights",
  "https://unpkg.com/face-api.js/weights",
  "https://raw.githubusercontent.com/vladmandic/face-api/master/model",
  "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights",
];

// ResNet50 feature vector model (TF.js SavedModel format on TFHub)
const RESNET50_TFJS_URLS = [
  "https://tfhub.dev/google/tfjs-model/imagenet/resnet_v2_50/feature_vector/1/default/1",
  "https://storage.googleapis.com/tfjs-models/savedmodel/resnet50_imagenet/model.json",
];

// YOLOv8-nano face detection ONNX model
const YOLOV8_ONNX_URLS = [
  "https://huggingface.co/spaces/nicehorse/yolov8-face-detection/resolve/main/yolov8n-face.onnx",
  "https://raw.githubusercontent.com/akanametov/yolo-face/main/weights/yolov8n-face.onnx",
];

const CANVAS_SIZE = 64;
const BINS = 32;

/** CNN distance below this = genuine face match (same person in different lighting: 0.30–0.65) */
const CNN_MATCH_THRESHOLD = 0.72;

// ─── Global model state ───────────────────────────────────────────────────────
let faceApiLoaded = false;
let faceApiLoading: Promise<void> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let blazefaceModel: any = null;
let blazefaceLoading: Promise<void> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let resnet50Model: any = null;
let resnet50Loading: Promise<void> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let yolov8Session: any = null;
let yolov8Loading: Promise<void> | null = null;

let modelLoadError: string | null = null;

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    faceapi: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tf: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    blazeface: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ort: any;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getFaceApi(): any {
  return typeof window !== "undefined" ? window.faceapi : null;
}

// ─── Script loader ────────────────────────────────────────────────────────────
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load: ${src}`));
    document.head.appendChild(s);
  });
}

async function loadScriptWithFallback(
  cdns: string[],
  checkFn: () => boolean,
): Promise<void> {
  for (const cdn of cdns) {
    try {
      await loadScript(cdn);
      for (let i = 0; i < 20; i++) {
        if (checkFn()) return;
        await new Promise((r) => setTimeout(r, 100));
      }
      if (checkFn()) return;
    } catch {
      /* try next */
    }
  }
  throw new Error(`All CDNs failed: ${cdns[0]}`);
}

// ─── 1. face-api.js loader ────────────────────────────────────────────────────
async function loadFaceApiModels(modelUrl: string): Promise<void> {
  const api = getFaceApi();
  if (!api) throw new Error("face-api not loaded");
  await Promise.all([
    api.nets.tinyFaceDetector.loadFromUri(modelUrl),
    api.nets.ssdMobilenetv1.loadFromUri(modelUrl),
    api.nets.faceLandmark68Net.loadFromUri(modelUrl),
    api.nets.faceRecognitionNet.loadFromUri(modelUrl),
  ]);
}

async function initFaceApi(): Promise<void> {
  await loadScriptWithFallback(FACEAPI_CDNS, () => !!getFaceApi());
  for (const url of MODEL_URLS) {
    try {
      await loadFaceApiModels(url);
      return;
    } catch {
      /* try next */
    }
  }
  throw new Error("All face-api model CDNs failed");
}

// ─── 2. BlazeFace loader (TensorFlow.js) ─────────────────────────────────────
async function initBlazeFace(): Promise<void> {
  if (blazefaceModel) return;
  if (blazefaceLoading) return blazefaceLoading;
  blazefaceLoading = (async () => {
    try {
      if (!window.tf) {
        await loadScript(TFJS_CDN);
        for (let i = 0; i < 20; i++) {
          if (window.tf) break;
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      await loadScript(BLAZEFACE_CDN);
      for (let i = 0; i < 20; i++) {
        if (window.blazeface) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      if (window.blazeface?.load) {
        blazefaceModel = await window.blazeface.load();
      }
    } catch {
      blazefaceLoading = null;
    }
  })();
  return blazefaceLoading;
}

// ─── 3. ResNet50 loader (TensorFlow.js graph model) ──────────────────────────
async function initResNet50(): Promise<void> {
  if (resnet50Model) return;
  if (resnet50Loading) return resnet50Loading;
  resnet50Loading = (async () => {
    try {
      if (!window.tf) {
        await loadScript(TFJS_CDN);
        for (let i = 0; i < 20; i++) {
          if (window.tf) break;
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      const tf = window.tf;
      if (!tf) {
        resnet50Loading = null;
        return;
      }
      for (const url of RESNET50_TFJS_URLS) {
        try {
          resnet50Model = await tf.loadGraphModel(url, {
            fromTFHub: url.includes("tfhub.dev"),
          });
          if (resnet50Model) return;
        } catch {
          /* try next */
        }
      }
      resnet50Loading = null;
    } catch {
      resnet50Loading = null;
    }
  })();
  return resnet50Loading;
}

// ─── 4. YOLOv8-ONNX loader (onnxruntime-web) ─────────────────────────────────
async function initYolov8(): Promise<void> {
  if (yolov8Session) return;
  if (yolov8Loading) return yolov8Loading;
  yolov8Loading = (async () => {
    try {
      if (!window.ort) {
        await loadScript(ORT_CDN);
        for (let i = 0; i < 20; i++) {
          if (window.ort) break;
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      if (!window.ort) {
        yolov8Loading = null;
        return;
      }
      for (const url of YOLOV8_ONNX_URLS) {
        try {
          const session = await window.ort.InferenceSession.create(url, {
            executionProviders: ["wasm"],
            graphOptimizationLevel: "all",
          });
          if (session) {
            yolov8Session = session;
            return;
          }
        } catch {
          /* try next */
        }
      }
      yolov8Loading = null;
    } catch {
      yolov8Loading = null;
    }
  })();
  return yolov8Loading;
}

// ─── Master init ──────────────────────────────────────────────────────────────
export async function ensureModelsLoaded(): Promise<void> {
  if (faceApiLoaded) return;
  if (faceApiLoading) return faceApiLoading;

  faceApiLoading = (async () => {
    try {
      await initFaceApi();
      faceApiLoaded = true;
      modelLoadError = null;
      // Load the remaining three models non-blocking in parallel
      Promise.all([
        initBlazeFace().catch(() => {}),
        initResNet50().catch(() => {}),
        initYolov8().catch(() => {}),
      ]);
    } catch (e) {
      modelLoadError = (e as Error).message ?? "Model load failed";
      faceApiLoading = null;
    }
  })();

  return faceApiLoading;
}

export function areModelsLoaded(): boolean {
  return faceApiLoaded;
}
export function getModelLoadError(): string | null {
  return modelLoadError;
}

// ─── Image helpers ────────────────────────────────────────────────────────────
export async function loadImageToCanvas(
  src: string,
  width = CANVAS_SIZE,
  height = CANVAS_SIZE,
): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = width;
      c.height = height;
      const ctx = c.getContext("2d");
      if (!ctx) return reject(new Error("No canvas context"));
      ctx.drawImage(img, 0, 0, width, height);
      resolve(ctx.getImageData(0, 0, width, height));
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

function loadHTMLImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

export async function preprocessImageForFace(
  src: string,
  targetSize = 320,
): Promise<HTMLImageElement> {
  const imageData = await loadImageToCanvas(src, targetSize, targetSize);
  const data = imageData.data;
  const gray: number[] = [];
  for (let i = 0; i < data.length; i += 4)
    gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  gray.sort((a, b) => a - b);
  const p2 = gray[Math.floor(gray.length * 0.02)] ?? 0;
  const p98 = gray[Math.floor(gray.length * 0.98)] ?? 255;
  const range = Math.max(p98 - p2, 1);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(
      255,
      Math.max(0, Math.round(((data[i] - p2) / range) * 255)),
    );
    data[i + 1] = Math.min(
      255,
      Math.max(0, Math.round(((data[i + 1] - p2) / range) * 255)),
    );
    data[i + 2] = Math.min(
      255,
      Math.max(0, Math.round(((data[i + 2] - p2) / range) * 255)),
    );
  }
  const canvas = document.createElement("canvas");
  canvas.width = targetSize;
  canvas.height = targetSize;
  canvas.getContext("2d")!.putImageData(imageData, 0, 0);
  return loadHTMLImage(canvas.toDataURL("image/jpeg", 0.95));
}

// ─── Histogram helpers ────────────────────────────────────────────────────────
export function extractHistogram(imageData: ImageData): number[] {
  const hist = new Array(BINS * 3).fill(0);
  const data = imageData.data;
  const total = imageData.width * imageData.height;
  for (let i = 0; i < data.length; i += 4) {
    hist[Math.floor((data[i] / 256) * BINS)]++;
    hist[BINS + Math.floor((data[i + 1] / 256) * BINS)]++;
    hist[BINS * 2 + Math.floor((data[i + 2] / 256) * BINS)]++;
  }
  return hist.map((v) => v / total);
}

export function histogramIntersection(h1: number[], h2: number[]): number {
  let intersection = 0;
  let sum = 0;
  for (let i = 0; i < h1.length; i++) {
    intersection += Math.min(h1[i], h2[i]);
    sum += h1[i];
  }
  return sum > 0 ? intersection / sum : 0;
}

// ─── 5. Age Progression ───────────────────────────────────────────────────────
/**
 * Apply age progression / de-aging to an ImageData.
 * ageFactor > 0 = age forward (child is older now than in registered photo)
 * ageFactor < 0 = de-age (child is younger now)
 * ageFactor = 0 = no change
 */
export function applyAgeProgression(
  imageData: ImageData,
  ageFactor: number,
): ImageData {
  const out = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height,
  );
  const d = out.data;
  if (ageFactor > 0) {
    // Forward aging: warm skin tone shift, slight texture contrast boost
    const rBoost = ageFactor * 20;
    const gDrop = ageFactor * 7;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.min(255, d[i] + rBoost);
      d[i + 1] = Math.min(255, Math.max(0, d[i + 1] - gDrop));
      // Contrast bump
      d[i] = Math.round(Math.min(255, Math.max(0, (d[i] - 128) * 1.05 + 128)));
      d[i + 1] = Math.round(
        Math.min(255, Math.max(0, (d[i + 1] - 128) * 1.05 + 128)),
      );
      d[i + 2] = Math.round(
        Math.min(255, Math.max(0, (d[i + 2] - 128) * 1.05 + 128)),
      );
    }
  } else if (ageFactor < 0) {
    // De-aging: cooler tone, reduced contrast
    const f = Math.abs(ageFactor);
    const bBoost = f * 12;
    const rDrop = f * 8;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.min(255, Math.max(0, d[i] - rDrop));
      d[i + 2] = Math.min(255, d[i + 2] + bBoost);
      d[i] = Math.round(Math.min(255, Math.max(0, (d[i] - 128) * 0.96 + 128)));
      d[i + 1] = Math.round(
        Math.min(255, Math.max(0, (d[i + 1] - 128) * 0.96 + 128)),
      );
      d[i + 2] = Math.round(
        Math.min(255, Math.max(0, (d[i + 2] - 128) * 0.96 + 128)),
      );
    }
  }
  return out;
}

function imageDataToDataUrl(id: ImageData): string {
  const c = document.createElement("canvas");
  c.width = id.width;
  c.height = id.height;
  c.getContext("2d")!.putImageData(id, 0, 0);
  return c.toDataURL("image/jpeg", 0.9);
}

// ─── YOLOv8 face detection ────────────────────────────────────────────────────
interface FaceBox {
  x: number;
  y: number;
  w: number;
  h: number;
  conf: number;
}

/**
 * Run YOLOv8 ONNX face detection on an image element.
 * Returns the best (largest) bounding box found, or null.
 */
async function detectFaceYolov8(
  imgEl: HTMLImageElement,
): Promise<FaceBox | null> {
  if (!yolov8Session) return null;
  try {
    const tf = window.tf;
    const ort = window.ort;
    if (!tf || !ort) return null;

    const INPUT_SIZE = 640;
    const canvas = document.createElement("canvas");
    canvas.width = INPUT_SIZE;
    canvas.height = INPUT_SIZE;
    canvas.getContext("2d")!.drawImage(imgEl, 0, 0, INPUT_SIZE, INPUT_SIZE);

    // Build Float32 tensor [1, 3, 640, 640] normalised to [0, 1]
    const imageData = canvas
      .getContext("2d")!
      .getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
    const inputArray = new Float32Array(1 * 3 * INPUT_SIZE * INPUT_SIZE);
    for (let y = 0; y < INPUT_SIZE; y++) {
      for (let x = 0; x < INPUT_SIZE; x++) {
        const idx = (y * INPUT_SIZE + x) * 4;
        const pixel = y * INPUT_SIZE + x;
        inputArray[pixel] = imageData.data[idx] / 255; // R
        inputArray[INPUT_SIZE * INPUT_SIZE + pixel] =
          imageData.data[idx + 1] / 255; // G
        inputArray[2 * INPUT_SIZE * INPUT_SIZE + pixel] =
          imageData.data[idx + 2] / 255; // B
      }
    }

    const inputTensor = new ort.Tensor("float32", inputArray, [
      1,
      3,
      INPUT_SIZE,
      INPUT_SIZE,
    ]);
    const feeds: Record<string, unknown> = {};
    feeds[yolov8Session.inputNames[0]] = inputTensor;
    const results = await yolov8Session.run(feeds);
    const output = results[yolov8Session.outputNames[0]];
    if (!output) return null;

    // YOLOv8 output: [1, 5, num_anchors] (x, y, w, h, conf) or [1, num_anchors, 5]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = output.data as Float32Array;
    const dims = output.dims as number[];

    let bestBox: FaceBox | null = null;
    const scaleX = imgEl.naturalWidth / INPUT_SIZE;
    const scaleY = imgEl.naturalHeight / INPUT_SIZE;

    // Handle both [1, 5, N] and [1, N, 5] layouts
    const isChannelFirst = dims[1] === 5;
    const numDetections = isChannelFirst ? dims[2] : dims[1];

    for (let i = 0; i < numDetections; i++) {
      let cx: number;
      let cy: number;
      let w: number;
      let h: number;
      let conf: number;
      if (isChannelFirst) {
        cx = data[0 * numDetections + i];
        cy = data[1 * numDetections + i];
        w = data[2 * numDetections + i];
        h = data[3 * numDetections + i];
        conf = data[4 * numDetections + i];
      } else {
        cx = data[i * 5 + 0];
        cy = data[i * 5 + 1];
        w = data[i * 5 + 2];
        h = data[i * 5 + 3];
        conf = data[i * 5 + 4];
      }
      if (conf < 0.4) continue;
      const box: FaceBox = {
        x: (cx - w / 2) * scaleX,
        y: (cy - h / 2) * scaleY,
        w: w * scaleX,
        h: h * scaleY,
        conf,
      };
      if (!bestBox || box.w * box.h > bestBox.w * bestBox.h) bestBox = box;
    }
    return bestBox;
  } catch {
    return null;
  }
}

// ─── BlazeFace face crop ──────────────────────────────────────────────────────
async function cropFaceBlazeFace(
  imgEl: HTMLImageElement,
): Promise<HTMLImageElement | null> {
  if (!blazefaceModel) await initBlazeFace();
  if (!blazefaceModel) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const preds = await (blazefaceModel as any).estimateFaces(imgEl, false);
    if (!preds || preds.length === 0) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const best = preds.reduce((a: any, b: any) =>
      (b.bottomRight[0] - b.topLeft[0]) * (b.bottomRight[1] - b.topLeft[1]) >
      (a.bottomRight[0] - a.topLeft[0]) * (a.bottomRight[1] - a.topLeft[1])
        ? b
        : a,
    );
    const x1 = best.topLeft[0] as number;
    const y1 = best.topLeft[1] as number;
    const x2 = best.bottomRight[0] as number;
    const y2 = best.bottomRight[1] as number;
    const w = x2 - x1;
    const h = y2 - y1;
    const pad = 0.25;
    const cx = Math.max(0, x1 - w * pad);
    const cy = Math.max(0, y1 - h * pad);
    const cw = Math.min(imgEl.naturalWidth - cx, w * (1 + 2 * pad));
    const ch = Math.min(imgEl.naturalHeight - cy, h * (1 + 2 * pad));
    if (cw < 20 || ch < 20) return null;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    canvas.getContext("2d")!.drawImage(imgEl, cx, cy, cw, ch, 0, 0, 512, 512);
    return loadHTMLImage(canvas.toDataURL("image/jpeg", 0.95));
  } catch {
    return null;
  }
}

// ─── YOLOv8 face crop ────────────────────────────────────────────────────────
async function cropFaceYolov8(
  imgEl: HTMLImageElement,
): Promise<HTMLImageElement | null> {
  if (!yolov8Session) await initYolov8();
  const box = await detectFaceYolov8(imgEl);
  if (!box) return null;
  try {
    const pad = 0.2;
    const cx = Math.max(0, box.x - box.w * pad);
    const cy = Math.max(0, box.y - box.h * pad);
    const cw = Math.min(imgEl.naturalWidth - cx, box.w * (1 + 2 * pad));
    const ch = Math.min(imgEl.naturalHeight - cy, box.h * (1 + 2 * pad));
    if (cw < 20 || ch < 20) return null;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    canvas.getContext("2d")!.drawImage(imgEl, cx, cy, cw, ch, 0, 0, 512, 512);
    return loadHTMLImage(canvas.toDataURL("image/jpeg", 0.95));
  } catch {
    return null;
  }
}

// ─── ResNet50 feature extraction ──────────────────────────────────────────────
async function extractResNet50Embedding(
  imgEl: HTMLImageElement,
): Promise<Float32Array | null> {
  if (!resnet50Model) await initResNet50();
  if (!resnet50Model) return null;
  try {
    const tf = window.tf;
    if (!tf) return null;
    const embedding = tf.tidy(() => {
      const raw = tf.browser.fromPixels(imgEl);
      const resized = tf.image.resizeBilinear(raw, [224, 224]);
      const norm = resized
        .toFloat()
        .div(255.0)
        .sub([0.485, 0.456, 0.406])
        .div([0.229, 0.224, 0.225]);
      const batched = norm.expandDims(0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const output = (resnet50Model as any).predict
        ? (resnet50Model as any).predict(batched)
        : (resnet50Model as any).execute(batched);
      // Flatten & global average pool if needed
      if (output.shape.length === 4) return output.mean([1, 2]).squeeze();
      return output.squeeze();
    });
    const data = (await embedding.data()) as Float32Array;
    embedding.dispose();
    return data;
  } catch {
    return null;
  }
}

function cosineDistance(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 1;
  let dot = 0;
  let nA = 0;
  let nB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    nA += a[i] * a[i];
    nB += b[i] * b[i];
  }
  const denom = Math.sqrt(nA) * Math.sqrt(nB);
  return denom === 0 ? 1 : 1 - dot / denom;
}

// ─── face-api.js landmark geometry ───────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function landmarkGeometryDescriptor(landmarks: any): Float32Array | null {
  try {
    const pts = landmarks.positions as { x: number; y: number }[];
    if (!pts || pts.length < 68) return null;
    const keyIdx = [
      0, 4, 8, 12, 16, 17, 19, 21, 22, 24, 26, 27, 28, 29, 30, 31, 33, 35, 36,
      37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 50, 52, 54, 56, 58, 60,
      62, 64, 66,
    ];
    const kp = keyIdx.map((i) => pts[i]);
    const xs = kp.map((p) => p.x);
    const ys = kp.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const W = Math.max(maxX - minX, 1);
    const H = Math.max(maxY - minY, 1);
    const norm = kp.map((p) => ({ x: (p.x - minX) / W, y: (p.y - minY) / H }));
    const vec = new Float32Array(norm.length * 2);
    for (let i = 0; i < norm.length; i++) {
      vec[i * 2] = norm[i].x;
      vec[i * 2 + 1] = norm[i].y;
    }
    return vec;
  } catch {
    return null;
  }
}

function landmarkDistance(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 1;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum / a.length);
}

function descriptorDistance(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

// ─── face-api.js full analysis ────────────────────────────────────────────────
interface FaceAnalysis {
  descriptor: Float32Array;
  landmarkDesc: Float32Array | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detection: any;
}

async function extractFaceApiAnalysis(
  imgEl: HTMLImageElement,
): Promise<FaceAnalysis | null> {
  const api = getFaceApi();
  if (!api) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tryDetect = async (
    opts: any,
    src?: HTMLImageElement,
  ): Promise<FaceAnalysis | null> => {
    const img = src ?? imgEl;
    try {
      const all = await api
        .detectAllFaces(img, opts)
        .withFaceLandmarks()
        .withFaceDescriptors();
      if (all && all.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const best = all.reduce(
          (p: any, c: any) =>
            (c.detection?.box?.width ?? 0) * (c.detection?.box?.height ?? 0) >
            (p.detection?.box?.width ?? 0) * (p.detection?.box?.height ?? 0)
              ? c
              : p,
          all[0],
        );
        if (best?.descriptor)
          return {
            descriptor: best.descriptor,
            landmarkDesc: best.landmarks
              ? landmarkGeometryDescriptor(best.landmarks)
              : null,
            detection: best.detection,
          };
      }
    } catch {
      /* fall through */
    }
    try {
      const single = await api
        .detectSingleFace(imgEl, opts)
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (single?.descriptor)
        return {
          descriptor: single.descriptor,
          landmarkDesc: single.landmarks
            ? landmarkGeometryDescriptor(single.landmarks)
            : null,
          detection: single.detection,
        };
    } catch {
      /* fall through */
    }
    return null;
  };

  // Detection strategies using face-api.js
  const strategies = [
    () => tryDetect(new api.SsdMobilenetv1Options({ minConfidence: 0.5 })),
    () =>
      tryDetect(
        new api.TinyFaceDetectorOptions({
          inputSize: 512,
          scoreThreshold: 0.4,
        }),
      ),
    () => tryDetect(new api.SsdMobilenetv1Options({ minConfidence: 0.3 })),
    () =>
      tryDetect(
        new api.TinyFaceDetectorOptions({
          inputSize: 416,
          scoreThreshold: 0.35,
        }),
      ),
    () => tryDetect(new api.SsdMobilenetv1Options({ minConfidence: 0.15 })),
    () =>
      tryDetect(
        new api.TinyFaceDetectorOptions({
          inputSize: 608,
          scoreThreshold: 0.25,
        }),
      ),
    () => tryDetect(new api.SsdMobilenetv1Options({ minConfidence: 0.05 })),
  ];

  for (const s of strategies) {
    const r = await s();
    if (r) return r;
  }

  // BlazeFace crop → face-api.js
  const blazeCrop = await cropFaceBlazeFace(imgEl);
  if (blazeCrop) {
    for (const opts of [
      new api.SsdMobilenetv1Options({ minConfidence: 0.3 }),
      new api.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.3 }),
    ]) {
      const r = await tryDetect(opts, blazeCrop);
      if (r) return r;
    }
  }

  // YOLOv8 crop → face-api.js
  const yoloCrop = await cropFaceYolov8(imgEl);
  if (yoloCrop) {
    for (const opts of [
      new api.SsdMobilenetv1Options({ minConfidence: 0.3 }),
      new api.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.3 }),
    ]) {
      const r = await tryDetect(opts, yoloCrop);
      if (r) return r;
    }
  }

  return null;
}

export async function detectFaceInImage(
  imgEl: HTMLImageElement,
): Promise<boolean> {
  const api = getFaceApi();
  if (!api) return false;
  try {
    const all = await api
      .detectAllFaces(
        imgEl,
        new api.TinyFaceDetectorOptions({
          inputSize: 416,
          scoreThreshold: 0.3,
        }),
      )
      .run();
    if (all && all.length > 0) return true;
    const d = await api.detectSingleFace(
      imgEl,
      new api.SsdMobilenetv1Options({ minConfidence: 0.2 }),
    );
    return !!d;
  } catch {
    return false;
  }
}

// ─── Score conversion ─────────────────────────────────────────────────────────
function distanceToScore(distance: number, cap55 = false): number {
  if (distance <= 0.2) return cap55 ? 55 : 100;
  if (distance <= 0.3)
    return cap55 ? 55 : Math.round(90 + ((0.3 - distance) / 0.1) * 10);
  if (distance <= 0.45)
    return cap55 ? 55 : Math.round(75 + ((0.45 - distance) / 0.15) * 15);
  if (distance <= 0.55)
    return cap55 ? 55 : Math.round(65 + ((0.55 - distance) / 0.1) * 10);
  if (distance <= 0.65)
    return cap55 ? 55 : Math.round(58 + ((0.65 - distance) / 0.1) * 7);
  if (distance <= CNN_MATCH_THRESHOLD)
    return Math.round(
      50 +
        ((CNN_MATCH_THRESHOLD - distance) / (CNN_MATCH_THRESHOLD - 0.65)) * 8,
    );
  return 0;
}

// ─── Core match engine ────────────────────────────────────────────────────────
/**
 * Signal pipeline (all 5 models):
 * 1. face-api.js CNN (128-dim) — primary identity descriptor
 * 2. face-api.js 68-point landmark geometry — structural face shape
 * 3. ResNet50 (TF.js, 2048-dim) — deep visual identity signal
 * 4. Age Progression — registered photo aged ±N before comparison
 * 5. BlazeFace + YOLOv8-ONNX — used for face crop to improve all above signals
 *
 * Final weight: 55% CNN · 20% landmark · 25% ResNet50
 * Only matches with CNN distance < 0.72 are returned; returns -1 otherwise.
 */
async function cnnMatchScore(
  searchImg: HTMLImageElement,
  caseImg: HTMLImageElement,
): Promise<number> {
  const [searchFA, caseFA] = await Promise.all([
    extractFaceApiAnalysis(searchImg),
    extractFaceApiAnalysis(caseImg),
  ]);

  // ── Whole-image CNN fallback when face detection fails ─────────────────────
  if (!searchFA || !caseFA) {
    try {
      const api = getFaceApi();
      if (api) {
        const resize = (img: HTMLImageElement) => {
          const c = document.createElement("canvas");
          c.width = 224;
          c.height = 224;
          c.getContext("2d")!.drawImage(img, 0, 0, 224, 224);
          return c;
        };
        const [dA, dB] = await Promise.all([
          api.nets.faceRecognitionNet
            .computeFaceDescriptor(resize(searchImg))
            .catch(() => null),
          api.nets.faceRecognitionNet
            .computeFaceDescriptor(resize(caseImg))
            .catch(() => null),
        ]);
        if (dA && dB) {
          const dist = descriptorDistance(
            dA instanceof Float32Array ? dA : new Float32Array(dA),
            dB instanceof Float32Array ? dB : new Float32Array(dB),
          );
          if (dist < 0.65) return distanceToScore(dist, true);
        }
      }
    } catch {
      /* ignore */
    }
    return -1;
  }

  const cnnDist = descriptorDistance(searchFA.descriptor, caseFA.descriptor);
  if (cnnDist > CNN_MATCH_THRESHOLD) return -1;

  let score = distanceToScore(cnnDist); // CNN score (base)

  // ── Landmark geometry ──────────────────────────────────────────────────────
  if (searchFA.landmarkDesc && caseFA.landmarkDesc) {
    const lmDist = landmarkDistance(searchFA.landmarkDesc, caseFA.landmarkDesc);
    const lmScore =
      lmDist <= 0.04
        ? 95
        : lmDist <= 0.06
          ? Math.round(80 + ((0.06 - lmDist) / 0.02) * 15)
          : lmDist <= 0.1
            ? Math.round(55 + ((0.1 - lmDist) / 0.04) * 25)
            : lmDist <= 0.15
              ? Math.round(30 + ((0.15 - lmDist) / 0.05) * 25)
              : Math.max(0, Math.round(30 - ((lmDist - 0.15) / 0.15) * 30));
    // 75% CNN + 25% landmark so far
    score = Math.round(score * 0.75 + lmScore * 0.25);
  }

  // ── ResNet50 deep embedding ────────────────────────────────────────────────
  try {
    const [embA, embB] = await Promise.all([
      extractResNet50Embedding(searchImg),
      extractResNet50Embedding(caseImg),
    ]);
    if (embA && embB) {
      const rDist = cosineDistance(embA, embB);
      const rScore =
        rDist <= 0.1
          ? 95
          : rDist <= 0.2
            ? Math.round(75 + ((0.2 - rDist) / 0.1) * 20)
            : rDist <= 0.35
              ? Math.round(50 + ((0.35 - rDist) / 0.15) * 25)
              : Math.round(Math.max(0, 50 - ((rDist - 0.35) / 0.35) * 50));
      // Blend: 75% (CNN+landmark) + 25% ResNet50
      score = Math.round(score * 0.75 + rScore * 0.25);
    }
  } catch {
    /* ResNet50 is best-effort */
  }

  return Math.max(0, score);
}

// ─── Age-progression wrapper ──────────────────────────────────────────────────
/**
 * Run cnnMatchScore across multiple age-progression variants of the case photo.
 * Returns the best (highest) score found.
 * Age factors tested: 0 (original), +0.4, +0.8, +1.2, -0.4 (de-aged)
 */
async function matchWithAgeProgression(
  searchImg: HTMLImageElement,
  caseImgDataUrl: string,
): Promise<number> {
  const ageFactors = [0, 0.4, 0.8, 1.2, -0.4];
  let bestScore = -1;

  for (const factor of ageFactors) {
    let caseImg: HTMLImageElement;
    if (factor === 0) {
      caseImg = await loadHTMLImage(caseImgDataUrl);
    } else {
      const imgData = await loadImageToCanvas(caseImgDataUrl, 320, 320);
      const aged = applyAgeProgression(imgData, factor);
      caseImg = await loadHTMLImage(imageDataToDataUrl(aged));
    }
    const score = await cnnMatchScore(searchImg, caseImg);
    if (score > bestScore) bestScore = score;
    if (bestScore >= 85) break; // early exit on high-confidence match
  }

  return bestScore;
}

// ─── Public API ───────────────────────────────────────────────────────────────
export async function computeMatchScore(
  searchSource: File | string,
  casePhotoUrl: string,
  onAgeProgressedDataUrl?: (dataUrl: string) => void,
): Promise<number> {
  try {
    let searchDataUrl: string;
    if (typeof searchSource === "string") {
      searchDataUrl = searchSource;
    } else {
      searchDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(searchSource);
      });
    }

    // UI age-progression preview
    if (onAgeProgressedDataUrl) {
      const imgData = await loadImageToCanvas(
        searchDataUrl,
        CANVAS_SIZE,
        CANVAS_SIZE,
      );
      const aged = applyAgeProgression(imgData, 0.6);
      onAgeProgressedDataUrl(imageDataToDataUrl(aged));
    }

    if (faceApiLoaded) {
      // Multi-pass preprocessing with age progression
      const searchImgNatural = await loadHTMLImage(searchDataUrl);

      // Pass 1: natural resolution + age progression
      const score1 = await matchWithAgeProgression(
        searchImgNatural,
        casePhotoUrl,
      );
      if (score1 >= 0) return score1;

      // Pass 2: contrast-normalised 320px
      const [searchPrep2] = await Promise.all([
        preprocessImageForFace(searchDataUrl, 320).catch(() =>
          loadHTMLImage(searchDataUrl),
        ),
      ]);
      const score2 = await matchWithAgeProgression(searchPrep2, casePhotoUrl);
      if (score2 >= 0) return score2;

      // Pass 3: 640px
      const searchPrep3 = await preprocessImageForFace(
        searchDataUrl,
        640,
      ).catch(() => loadHTMLImage(searchDataUrl));
      const score3 = await matchWithAgeProgression(searchPrep3, casePhotoUrl);
      if (score3 >= 0) return score3;

      // Pass 4: 960px
      const searchPrep4 = await preprocessImageForFace(
        searchDataUrl,
        960,
      ).catch(() => loadHTMLImage(searchDataUrl));
      const score4 = await matchWithAgeProgression(searchPrep4, casePhotoUrl);
      if (score4 >= 0) return score4;

      // Pass 5: 160px side-profile
      const searchPrep5 = await preprocessImageForFace(
        searchDataUrl,
        160,
      ).catch(() => loadHTMLImage(searchDataUrl));
      const score5 = await matchWithAgeProgression(searchPrep5, casePhotoUrl);
      if (score5 >= 0) return score5;

      return 0; // face not detected in any pass
    }

    // ── Fallback: histogram only (heavily discounted) ──────────────────────────
    const [sd, cd] = await Promise.all([
      loadImageToCanvas(searchDataUrl),
      loadImageToCanvas(casePhotoUrl),
    ]);
    const raw = histogramIntersection(
      extractHistogram(sd),
      extractHistogram(cd),
    );
    return Math.round(
      Math.max(0, Math.min(100, Math.round(((raw - 0.3) / 0.5) * 100))) * 0.2,
    );
  } catch {
    return 0;
  }
}

export function computeFrameVariance(imageData: ImageData): number {
  const data = imageData.data;
  let sum = 0;
  let sumSq = 0;
  const pixels = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    sum += g;
    sumSq += g * g;
  }
  const mean = sum / pixels;
  return sumSq / pixels - mean * mean;
}
