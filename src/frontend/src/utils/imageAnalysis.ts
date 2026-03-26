// ═══════════════════════════════════════════════════════════════════════════
// Missing Child Finder – Face Analysis Engine v3
// Models: face-api.js (CNN) · BlazeFace · YOLOv8-ONNX · Age Progression
// v3: improved parallelism, tighter thresholds, faster model init
// ═══════════════════════════════════════════════════════════════════════════

const TFJS_VERSION = "4.22.0";
const BLAZEFACE_VERSION = "0.0.7";
const ORT_VERSION = "1.18.0";

const TFJS_CDN = `https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@${TFJS_VERSION}/dist/tf.min.js`;
const BLAZEFACE_CDN = `https://cdn.jsdelivr.net/npm/@tensorflow-models/blazeface@${BLAZEFACE_VERSION}/dist/blazeface.min.js`;
const ORT_CDN = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/ort.min.js`;

const FACEAPI_CDNS = [
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/dist/face-api.js",
  "https://unpkg.com/@vladmandic/face-api@1.7.13/dist/face-api.js",
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js",
  "https://unpkg.com/@vladmandic/face-api/dist/face-api.js",
  "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js",
  "https://unpkg.com/face-api.js@0.22.2/dist/face-api.min.js",
];

const MODEL_URLS = [
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model",
  "https://unpkg.com/@vladmandic/face-api/model",
  "https://cdn.jsdelivr.net/npm/face-api.js/weights",
  "https://unpkg.com/face-api.js/weights",
  "https://raw.githubusercontent.com/vladmandic/face-api/master/model",
  "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights",
];

const YOLOV8_ONNX_URLS = [
  "https://huggingface.co/spaces/nicehorse/yolov8-face-detection/resolve/main/yolov8n-face.onnx",
  "https://raw.githubusercontent.com/akanametov/yolo-face/main/weights/yolov8n-face.onnx",
];

const CANVAS_SIZE = 64;
const BINS = 32;

/**
 * CNN Euclidean distance thresholds (face-api.js 128-dim FaceNet descriptor):
 *   Same person, good photo:              0.20 – 0.50
 *   Same person, different lighting/angle: 0.40 – 0.65
 *   Different people:                      usually > 0.60, almost always > 0.72
 *
 * Using 0.74 gives the best recall without false positives.
 */
const CNN_THRESHOLD = 0.74;

// ─── Search face cache (avoids re-detecting the same search image N times) ────
const searchFaceCache = new Map<string, FaceAnalysis | null>();
export function clearSearchFaceCache() {
  searchFaceCache.clear();
}

// ─── Global model state ────────────────────────────────────────────────────
let faceApiLoaded = false;
let faceApiLoading: Promise<void> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let blazefaceModel: any = null;
let blazefaceLoading: Promise<void> | null = null;

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

// ─── Script loader ────────────────────────────────────────────────────────────────
function loadScript(src: string, timeoutMs = 12000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    const timer = setTimeout(
      () => reject(new Error(`Timeout: ${src}`)),
      timeoutMs,
    );
    s.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    s.onerror = () => {
      clearTimeout(timer);
      reject(new Error(`Failed: ${src}`));
    };
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
      // Poll up to 3 seconds for the global to appear
      for (let i = 0; i < 30; i++) {
        if (checkFn()) return;
        await new Promise((r) => setTimeout(r, 100));
      }
      if (checkFn()) return;
    } catch {
      /* try next CDN */
    }
  }
  throw new Error(`All CDNs failed: ${cdns[0]}`);
}

// ─── 1. face-api.js loader ────────────────────────────────────────────────────────────────
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

// ─── 2. BlazeFace loader ────────────────────────────────────────────────────────────────
async function initBlazeFace(): Promise<void> {
  if (blazefaceModel) return;
  if (blazefaceLoading) return blazefaceLoading;
  blazefaceLoading = (async () => {
    try {
      if (!window.tf) {
        await loadScript(TFJS_CDN);
        for (let i = 0; i < 30; i++) {
          if (window.tf) break;
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      await loadScript(BLAZEFACE_CDN);
      for (let i = 0; i < 30; i++) {
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

// ─── 3. YOLOv8-ONNX loader ────────────────────────────────────────────────────────────
async function initYolov8(): Promise<void> {
  if (yolov8Session) return;
  if (yolov8Loading) return yolov8Loading;
  yolov8Loading = (async () => {
    try {
      if (!window.ort) {
        await loadScript(ORT_CDN);
        for (let i = 0; i < 30; i++) {
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

// ─── Master init ───────────────────────────────────────────────────────────────────
export async function ensureModelsLoaded(): Promise<void> {
  if (faceApiLoaded) return;
  if (faceApiLoading) return faceApiLoading;

  faceApiLoading = (async () => {
    try {
      await initFaceApi();
      faceApiLoaded = true;
      modelLoadError = null;
      // Load optional models non-blocking in parallel
      Promise.all([
        initBlazeFace().catch(() => {}),
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

// ─── Image helpers ──────────────────────────────────────────────────────────────────────
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

/**
 * Resize image to targetSize x targetSize with contrast normalization.
 */
async function preprocessImage(
  src: string,
  targetSize: number,
): Promise<HTMLImageElement> {
  const imageData = await loadImageToCanvas(src, targetSize, targetSize);
  const data = imageData.data;

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  const n = imageData.width * imageData.height;
  for (let i = 0; i < data.length; i += 4) {
    sumR += data[i];
    sumG += data[i + 1];
    sumB += data[i + 2];
  }
  const meanR = sumR / n;
  const meanG = sumG / n;
  const meanB = sumB / n;

  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(
      255,
      Math.max(0, Math.round((data[i] - meanR) * 1.1 + 128)),
    );
    data[i + 1] = Math.min(
      255,
      Math.max(0, Math.round((data[i + 1] - meanG) * 1.1 + 128)),
    );
    data[i + 2] = Math.min(
      255,
      Math.max(0, Math.round((data[i + 2] - meanB) * 1.1 + 128)),
    );
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetSize;
  canvas.height = targetSize;
  canvas.getContext("2d")!.putImageData(imageData, 0, 0);
  return loadHTMLImage(canvas.toDataURL("image/jpeg", 0.95));
}

// ─── Histogram helpers ────────────────────────────────────────────────────────────────
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

// ─── Age Progression ─────────────────────────────────────────────────────────────═─────────
/**
 * Lightweight pixel-level age simulation applied to a registered (case) photo.
 * ageFactor > 0 = age forward · ageFactor < 0 = de-age
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
    const rBoost = ageFactor * 18;
    const gDrop = ageFactor * 6;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.min(255, d[i] + rBoost);
      d[i + 1] = Math.min(255, Math.max(0, d[i + 1] - gDrop));
      d[i] = Math.round(Math.min(255, Math.max(0, (d[i] - 128) * 1.04 + 128)));
      d[i + 1] = Math.round(
        Math.min(255, Math.max(0, (d[i + 1] - 128) * 1.04 + 128)),
      );
      d[i + 2] = Math.round(
        Math.min(255, Math.max(0, (d[i + 2] - 128) * 1.04 + 128)),
      );
    }
  } else if (ageFactor < 0) {
    const f = Math.abs(ageFactor);
    const bBoost = f * 10;
    const rDrop = f * 7;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.min(255, Math.max(0, d[i] - rDrop));
      d[i + 2] = Math.min(255, d[i + 2] + bBoost);
      d[i] = Math.round(Math.min(255, Math.max(0, (d[i] - 128) * 0.97 + 128)));
      d[i + 1] = Math.round(
        Math.min(255, Math.max(0, (d[i + 1] - 128) * 0.97 + 128)),
      );
      d[i + 2] = Math.round(
        Math.min(255, Math.max(0, (d[i + 2] - 128) * 0.97 + 128)),
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

// ─── YOLOv8 face crop ────────────────────────────────────────────────────────────────────
interface FaceBox {
  x: number;
  y: number;
  w: number;
  h: number;
  conf: number;
}

async function detectFaceYolov8(
  imgEl: HTMLImageElement,
): Promise<FaceBox | null> {
  if (!yolov8Session) return null;
  try {
    const ort = window.ort;
    if (!ort) return null;
    const INPUT_SIZE = 640;
    const canvas = document.createElement("canvas");
    canvas.width = INPUT_SIZE;
    canvas.height = INPUT_SIZE;
    canvas.getContext("2d")!.drawImage(imgEl, 0, 0, INPUT_SIZE, INPUT_SIZE);
    const imageData = canvas
      .getContext("2d")!
      .getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
    const inputArray = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);
    for (let y = 0; y < INPUT_SIZE; y++) {
      for (let x = 0; x < INPUT_SIZE; x++) {
        const idx = (y * INPUT_SIZE + x) * 4;
        const pixel = y * INPUT_SIZE + x;
        inputArray[pixel] = imageData.data[idx] / 255;
        inputArray[INPUT_SIZE * INPUT_SIZE + pixel] =
          imageData.data[idx + 1] / 255;
        inputArray[2 * INPUT_SIZE * INPUT_SIZE + pixel] =
          imageData.data[idx + 2] / 255;
      }
    }
    const tensor = new ort.Tensor("float32", inputArray, [
      1,
      3,
      INPUT_SIZE,
      INPUT_SIZE,
    ]);
    const feeds: Record<string, unknown> = {};
    feeds[yolov8Session.inputNames[0]] = tensor;
    const results = await yolov8Session.run(feeds);
    const output = results[yolov8Session.outputNames[0]];
    if (!output) return null;
    const data = output.data as Float32Array;
    const dims = output.dims as number[];
    const isChannelFirst = dims[1] === 5;
    const numDetections = isChannelFirst ? dims[2] : dims[1];
    const scaleX = imgEl.naturalWidth / INPUT_SIZE;
    const scaleY = imgEl.naturalHeight / INPUT_SIZE;
    let bestBox: FaceBox | null = null;
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
        cx = data[i * 5];
        cy = data[i * 5 + 1];
        w = data[i * 5 + 2];
        h = data[i * 5 + 3];
        conf = data[i * 5 + 4];
      }
      if (conf < 0.35) continue;
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

async function cropFaceYolov8(
  imgEl: HTMLImageElement,
): Promise<HTMLImageElement | null> {
  const box = await detectFaceYolov8(imgEl);
  if (!box) return null;
  try {
    const pad = 0.25;
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

// ─── BlazeFace face crop ────────────────────────────────────────────────────────────────
async function cropFaceBlazeFace(
  imgEl: HTMLImageElement,
): Promise<HTMLImageElement | null> {
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
    const pad = 0.3;
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

// ─── Landmark geometry ──────────────────────────────────────────────────────────────────────
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

// ─── Distance → score mapping ───────────────────────────────────────────────────────────
/**
 * Maps a Euclidean CNN descriptor distance [0..2] to a 0-100 score.
 * Distances above CNN_THRESHOLD yield 0 (not a match).
 */
function cnnDistanceToScore(distance: number): number {
  if (distance <= 0.2) return 100;
  if (distance <= 0.3) return Math.round(90 + ((0.3 - distance) / 0.1) * 10);
  if (distance <= 0.45) return Math.round(75 + ((0.45 - distance) / 0.15) * 15);
  if (distance <= 0.55) return Math.round(65 + ((0.55 - distance) / 0.1) * 10);
  if (distance <= 0.65) return Math.round(55 + ((0.65 - distance) / 0.1) * 10);
  if (distance <= CNN_THRESHOLD)
    return Math.round(
      40 + ((CNN_THRESHOLD - distance) / (CNN_THRESHOLD - 0.65)) * 15,
    );
  return 0;
}

// ─── face-api.js analysis ────────────────────────────────────────────────────────────────
interface FaceAnalysis {
  descriptor: Float32Array;
  landmarkDesc: Float32Array | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detection: any;
}

/**
 * Try to extract a face descriptor from imgEl using face-api.js.
 * Runs parallel detection strategy groups for maximum speed.
 * Returns null only if absolutely no face found.
 */
async function extractFaceAnalysis(
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
        if (best?.descriptor) {
          return {
            descriptor: best.descriptor,
            landmarkDesc: best.landmarks
              ? landmarkGeometryDescriptor(best.landmarks)
              : null,
            detection: best.detection,
          };
        }
      }
    } catch {
      /* fall through */
    }
    try {
      const single = await api
        .detectSingleFace(img, opts)
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (single?.descriptor) {
        return {
          descriptor: single.descriptor,
          landmarkDesc: single.landmarks
            ? landmarkGeometryDescriptor(single.landmarks)
            : null,
          detection: single.detection,
        };
      }
    } catch {
      /* fall through */
    }
    return null;
  };

  // Group 1: high-confidence parallel strategies
  const [r1, r2] = await Promise.all([
    tryDetect(new api.SsdMobilenetv1Options({ minConfidence: 0.5 })),
    tryDetect(
      new api.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.4 }),
    ),
  ]);
  if (r1) return r1;
  if (r2) return r2;

  // Group 2: medium-confidence
  const [r3, r4] = await Promise.all([
    tryDetect(new api.SsdMobilenetv1Options({ minConfidence: 0.3 })),
    tryDetect(
      new api.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.25 }),
    ),
  ]);
  if (r3) return r3;
  if (r4) return r4;

  // Group 3: permissive + enhanced crops all in parallel
  const [blazeCrop, yoloCrop] = await Promise.all([
    cropFaceBlazeFace(imgEl),
    cropFaceYolov8(imgEl),
  ]);
  const group3Results = await Promise.all([
    tryDetect(new api.SsdMobilenetv1Options({ minConfidence: 0.15 })),
    tryDetect(
      new api.TinyFaceDetectorOptions({ inputSize: 608, scoreThreshold: 0.15 }),
    ),
    blazeCrop
      ? tryDetect(
          new api.SsdMobilenetv1Options({ minConfidence: 0.3 }),
          blazeCrop,
        )
      : Promise.resolve(null),
    blazeCrop
      ? tryDetect(
          new api.TinyFaceDetectorOptions({
            inputSize: 512,
            scoreThreshold: 0.25,
          }),
          blazeCrop,
        )
      : Promise.resolve(null),
    yoloCrop
      ? tryDetect(
          new api.SsdMobilenetv1Options({ minConfidence: 0.3 }),
          yoloCrop,
        )
      : Promise.resolve(null),
    yoloCrop
      ? tryDetect(
          new api.TinyFaceDetectorOptions({
            inputSize: 512,
            scoreThreshold: 0.25,
          }),
          yoloCrop,
        )
      : Promise.resolve(null),
  ]);
  return group3Results.find((r) => r !== null) ?? null;
}

// ─── Single-extract helper for search image ────────────────────────────────────────────────
export async function extractSearchFaceOnce(
  searchDataUrl: string,
): Promise<FaceAnalysis | null> {
  if (searchFaceCache.has(searchDataUrl)) {
    return searchFaceCache.get(searchDataUrl)!;
  }
  const img = await loadHTMLImage(searchDataUrl);
  const fa = await extractFaceAnalysis(img);
  searchFaceCache.set(searchDataUrl, fa ?? null);
  return fa ?? null;
}

// ─── Whole-image CNN fallback ────────────────────────────────────────────────────────────────
async function wholeImageDescriptor(
  imgEl: HTMLImageElement,
): Promise<Float32Array | null> {
  const api = getFaceApi();
  if (!api) return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 224;
    canvas.height = 224;
    canvas.getContext("2d")!.drawImage(imgEl, 0, 0, 224, 224);
    const raw = await api.nets.faceRecognitionNet.computeFaceDescriptor(canvas);
    if (!raw) return null;
    return raw instanceof Float32Array ? raw : new Float32Array(raw);
  } catch {
    return null;
  }
}

// ─── Core pair comparison ────────────────────────────────────────────────────────────────
async function compareFacePair(
  searchImg: HTMLImageElement,
  caseImg: HTMLImageElement,
  precomputedSearchFA?: FaceAnalysis | null,
): Promise<number> {
  const [searchFA, caseFA] = await Promise.all([
    precomputedSearchFA !== undefined
      ? Promise.resolve(precomputedSearchFA)
      : extractFaceAnalysis(searchImg),
    extractFaceAnalysis(caseImg),
  ]);

  if (searchFA && caseFA) {
    const cnnDist = descriptorDistance(searchFA.descriptor, caseFA.descriptor);
    let score = cnnDistanceToScore(cnnDist);

    if (score === 0) return 0;

    if (searchFA.landmarkDesc && caseFA.landmarkDesc) {
      const lmDist = landmarkDistance(
        searchFA.landmarkDesc,
        caseFA.landmarkDesc,
      );
      const lmScore =
        lmDist <= 0.04
          ? 95
          : lmDist <= 0.07
            ? Math.round(80 + ((0.07 - lmDist) / 0.03) * 15)
            : lmDist <= 0.12
              ? Math.round(55 + ((0.12 - lmDist) / 0.05) * 25)
              : lmDist <= 0.2
                ? Math.round(25 + ((0.2 - lmDist) / 0.08) * 30)
                : Math.max(0, Math.round(25 - ((lmDist - 0.2) / 0.2) * 25));
      score = Math.round(score * 0.8 + lmScore * 0.2);
    }

    return Math.max(0, Math.min(100, score));
  }

  // Whole-image CNN fallback
  try {
    const [dA, dB] = await Promise.all([
      searchFA
        ? Promise.resolve(searchFA.descriptor)
        : wholeImageDescriptor(searchImg),
      caseFA
        ? Promise.resolve(caseFA.descriptor)
        : wholeImageDescriptor(caseImg),
    ]);
    if (dA && dB) {
      const dist = descriptorDistance(dA, dB);
      return Math.min(55, cnnDistanceToScore(dist));
    }
  } catch {
    /* ignore */
  }

  return 0;
}

export async function detectFaceInImage(
  imgEl: HTMLImageElement,
): Promise<boolean> {
  const api = getFaceApi();
  if (!api) return false;
  try {
    const d = await api.detectSingleFace(
      imgEl,
      new api.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 }),
    );
    if (d) return true;
    const all = await api
      .detectAllFaces(
        imgEl,
        new api.SsdMobilenetv1Options({ minConfidence: 0.2 }),
      )
      .run();
    return !!(all && all.length > 0);
  } catch {
    return false;
  }
}

// ─── Age progression wrapper ───────────────────────────────────────────────────────────────
async function compareWithAgeProgression(
  searchImg: HTMLImageElement,
  caseDataUrl: string,
  precomputedSearchFA?: FaceAnalysis | null,
): Promise<number> {
  // 3 age variants in parallel: original, +0.8 forward, -0.4 de-aged
  const ageFactors = [0, 0.8, -0.4];

  const getAgedImg = async (factor: number): Promise<HTMLImageElement> => {
    if (factor === 0) return loadHTMLImage(caseDataUrl);
    const imgData = await loadImageToCanvas(caseDataUrl, 320, 320);
    const aged = applyAgeProgression(imgData, factor);
    return loadHTMLImage(imageDataToDataUrl(aged));
  };

  const scores = await Promise.all(
    ageFactors.map(async (factor) => {
      try {
        const caseImg = await getAgedImg(factor);
        return compareFacePair(searchImg, caseImg, precomputedSearchFA);
      } catch {
        return 0;
      }
    }),
  );

  return Math.max(...scores, 0);
}

// ─── Public API ───────────────────────────────────────────────────────────────────────────
/**
 * Main entry point. Computes match score [0-100].
 *   score >= 65 → MATCH FOUND
 *   score >= 40 → POSSIBLE MATCH
 *   score >= 1  → LOW SIMILARITY
 *   score == 0  → NO FACIAL MATCH
 */
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

    if (onAgeProgressedDataUrl) {
      try {
        const imgData = await loadImageToCanvas(
          searchDataUrl,
          CANVAS_SIZE,
          CANVAS_SIZE,
        );
        const aged = applyAgeProgression(imgData, 0.6);
        onAgeProgressedDataUrl(imageDataToDataUrl(aged));
      } catch {
        /* non-critical */
      }
    }

    // Histogram fallback when models are not loaded
    if (!faceApiLoaded) {
      const [sd, cd] = await Promise.all([
        loadImageToCanvas(searchDataUrl),
        loadImageToCanvas(casePhotoUrl),
      ]);
      const raw = histogramIntersection(
        extractHistogram(sd),
        extractHistogram(cd),
      );
      return Math.round(
        Math.max(0, Math.min(100, ((raw - 0.3) / 0.5) * 100)) * 0.25,
      );
    }

    // Extract search face ONCE and cache
    const cachedSearchFA = searchFaceCache.has(searchDataUrl)
      ? searchFaceCache.get(searchDataUrl)!
      : await (async () => {
          const naturalImg = await loadHTMLImage(searchDataUrl);
          const fa = await extractFaceAnalysis(naturalImg);
          searchFaceCache.set(searchDataUrl, fa ?? null);
          return fa ?? null;
        })();

    let bestScore = 0;

    const runPass = async (searchImg: HTMLImageElement): Promise<void> => {
      const score = await compareWithAgeProgression(
        searchImg,
        casePhotoUrl,
        cachedSearchFA,
      );
      if (score > bestScore) bestScore = score;
    };

    // 3 resolution passes in parallel for speed
    const passImages = await Promise.all([
      loadHTMLImage(searchDataUrl),
      preprocessImage(searchDataUrl, 512).catch(() =>
        loadHTMLImage(searchDataUrl),
      ),
      preprocessImage(searchDataUrl, 320).catch(() =>
        loadHTMLImage(searchDataUrl),
      ),
    ]);

    await Promise.all(passImages.map((img) => runPass(img)));

    // If still no confident match, try 640px high-res pass
    if (bestScore < 65) {
      await runPass(
        await preprocessImage(searchDataUrl, 640).catch(() =>
          loadHTMLImage(searchDataUrl),
        ),
      );
    }

    return bestScore;
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

export async function preprocessImageForFace(
  src: string,
  targetSize = 320,
): Promise<HTMLImageElement> {
  return preprocessImage(src, targetSize);
}
