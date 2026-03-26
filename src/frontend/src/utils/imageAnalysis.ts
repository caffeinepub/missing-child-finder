const CANVAS_SIZE = 64;
const BINS = 32;

// CDN list for face-api script -- tried in order
const FACEAPI_CDNS = [
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/dist/face-api.js",
  "https://unpkg.com/@vladmandic/face-api@1.7.13/dist/face-api.js",
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js",
  "https://unpkg.com/@vladmandic/face-api/dist/face-api.js",
  "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js",
  "https://unpkg.com/face-api.js@0.22.2/dist/face-api.min.js",
];

// CDN list for model weights -- tried in order
const MODEL_URLS = [
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model",
  "https://unpkg.com/@vladmandic/face-api/model",
  "https://cdn.jsdelivr.net/npm/face-api.js/weights",
  "https://unpkg.com/face-api.js/weights",
  "https://raw.githubusercontent.com/vladmandic/face-api/master/model",
  "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights",
];

let modelsLoaded = false;
let modelsLoading: Promise<void> | null = null;
let modelLoadError: string | null = null;

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    faceapi: any;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getFaceApi(): any {
  return typeof window !== "undefined" ? window.faceapi : null;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load: ${src}`));
    document.head.appendChild(script);
  });
}

async function loadScriptWithFallback(): Promise<void> {
  let lastError: Error | null = null;
  for (const cdn of FACEAPI_CDNS) {
    try {
      await loadScript(cdn);
      for (let i = 0; i < 10; i++) {
        if (getFaceApi()) return;
        await new Promise((r) => setTimeout(r, 50));
      }
      if (getFaceApi()) return;
    } catch (e) {
      lastError = e as Error;
    }
  }
  throw lastError ?? new Error("All face-api CDNs failed");
}

async function loadModelsFromUrl(modelUrl: string): Promise<void> {
  const api = getFaceApi();
  if (!api) throw new Error("face-api not loaded");
  await Promise.all([
    api.nets.tinyFaceDetector.loadFromUri(modelUrl),
    api.nets.ssdMobilenetv1.loadFromUri(modelUrl),
    api.nets.faceLandmark68Net.loadFromUri(modelUrl),
    api.nets.faceRecognitionNet.loadFromUri(modelUrl),
  ]);
}

export async function ensureModelsLoaded(): Promise<void> {
  if (modelsLoaded) return;
  if (modelsLoading) return modelsLoading;

  modelsLoading = (async () => {
    try {
      await loadScriptWithFallback();
      let loaded = false;
      for (const modelUrl of MODEL_URLS) {
        try {
          await loadModelsFromUrl(modelUrl);
          loaded = true;
          break;
        } catch {
          // try next CDN
        }
      }
      if (loaded) {
        modelsLoaded = true;
        modelLoadError = null;
      } else {
        modelLoadError =
          "Could not load face recognition models. Using histogram fallback.";
        modelsLoading = null;
      }
    } catch (e) {
      modelLoadError = (e as Error).message ?? "Model load failed";
      modelsLoading = null;
    }
  })();

  return modelsLoading;
}

export function areModelsLoaded(): boolean {
  return modelsLoaded;
}

export function getModelLoadError(): string | null {
  return modelLoadError;
}

export async function loadImageToCanvas(
  src: string,
  width = CANVAS_SIZE,
  height = CANVAS_SIZE,
): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
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
 * Load an image at its natural size (no forced resize).
 * Used when we want the detector to see the full resolution.
 */
function loadHTMLImageNatural(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

/**
 * Resize image to targetSize x targetSize and apply contrast normalization.
 */
export async function preprocessImageForFace(
  src: string,
  targetSize = 320,
): Promise<HTMLImageElement> {
  const imageData = await loadImageToCanvas(src, targetSize, targetSize);
  const data = imageData.data;

  const grayValues: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    grayValues.push(
      0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2],
    );
  }
  grayValues.sort((a, b) => a - b);

  const p2 = grayValues[Math.floor(grayValues.length * 0.02)] ?? 0;
  const p98 = grayValues[Math.floor(grayValues.length * 0.98)] ?? 255;
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
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(imageData, 0, 0);

  return loadHTMLImage(canvas.toDataURL("image/jpeg", 0.95));
}

export function extractHistogram(imageData: ImageData): number[] {
  const hist = new Array(BINS * 3).fill(0);
  const data = imageData.data;
  const pixelCount = imageData.width * imageData.height;

  for (let i = 0; i < data.length; i += 4) {
    const r = Math.floor((data[i] / 256) * BINS);
    const g = Math.floor((data[i + 1] / 256) * BINS);
    const b = Math.floor((data[i + 2] / 256) * BINS);
    hist[r]++;
    hist[BINS + g]++;
    hist[BINS * 2 + b]++;
  }

  return hist.map((v) => v / pixelCount);
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

/**
 * Apply pixel-level age progression transform.
 */
export function applyAgeProgression(
  imageData: ImageData,
  ageFactor: number,
): ImageData {
  const output = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height,
  );
  const data = output.data;

  if (ageFactor >= 0) {
    const rBoost = ageFactor * 20;
    const gReduce = ageFactor * 8;
    const brightness = ageFactor * 10;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, data[i] + rBoost + brightness * 0.3);
      data[i + 1] = Math.min(
        255,
        Math.max(0, data[i + 1] - gReduce + brightness * 0.1),
      );
      data[i + 2] = Math.min(255, data[i + 2] + brightness * 0.1);
      data[i] = Math.round(data[i] * 0.95 + 12);
      data[i + 1] = Math.round(data[i + 1] * 0.95 + 12);
      data[i + 2] = Math.round(data[i + 2] * 0.95 + 12);
    }
  } else {
    const factor = Math.abs(ageFactor);
    const bBoost = factor * 12;
    const rReduce = factor * 8;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, Math.max(0, data[i] - rReduce));
      data[i + 1] = Math.min(255, data[i + 1] + bBoost * 0.2);
      data[i + 2] = Math.min(255, data[i + 2] + bBoost);
      data[i] = Math.round(
        Math.min(255, Math.max(0, (data[i] - 128) * 1.08 + 128)),
      );
      data[i + 1] = Math.round(
        Math.min(255, Math.max(0, (data[i + 1] - 128) * 1.08 + 128)),
      );
      data[i + 2] = Math.round(
        Math.min(255, Math.max(0, (data[i + 2] - 128) * 1.08 + 128)),
      );
    }
  }

  return output;
}

function imageDataToDataUrl(imageData: ImageData): string {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.9);
}

/**
 * Distance to score:
 * <= 0.30 → 90-100 (very high confidence)
 * <= 0.44 → 65-89  (likely match)
 * <= 0.60 → 35-64  (possible)
 * > 0.60  → 0-34   (low)
 */
function distanceToScore(distance: number): number {
  // Tighter thresholds: face-api same-person < 0.5, different > 0.6
  if (distance <= 0.35) return Math.round(90 + ((0.35 - distance) / 0.35) * 10);
  if (distance <= 0.45) return Math.round(65 + ((0.45 - distance) / 0.1) * 24);
  if (distance <= 0.55) return Math.round(35 + ((0.55 - distance) / 0.1) * 29);
  return 0; // distance > 0.55 = definitely different person
}

/**
 * Facial landmark geometry descriptor:
 * 68 points normalized to the bounding box of the face.
 * Computes pairwise distances between key structural points:
 *   jaw, eyebrows, nose bridge, nose tip, eye corners, mouth corners.
 * Returns a normalized feature vector capturing face proportions.
 */
function landmarkGeometryDescriptor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  landmarks: any,
): Float32Array | null {
  try {
    const pts = landmarks.positions as { x: number; y: number }[];
    if (!pts || pts.length < 68) return null;

    // Key landmark indices (face-api 68-point model):
    // Jaw: 0-16, left brow: 17-21, right brow: 22-26
    // Nose bridge: 27-30, nose base: 31-35
    // Left eye: 36-41, right eye: 42-47
    // Mouth outer: 48-59, mouth inner: 60-67
    const keyIndices = [
      0,
      4,
      8,
      12,
      16, // jaw outline (5 pts)
      17,
      19,
      21, // left brow
      22,
      24,
      26, // right brow
      27,
      28,
      29,
      30, // nose bridge
      31,
      33,
      35, // nose base
      36,
      37,
      38,
      39,
      40,
      41, // left eye (all 6)
      42,
      43,
      44,
      45,
      46,
      47, // right eye (all 6)
      48,
      50,
      52,
      54,
      56,
      58, // mouth outer (every other)
      60,
      62,
      64,
      66, // mouth inner
    ];

    const keyPts = keyIndices.map((i) => pts[i]);

    // Normalize to bounding box
    const xs = keyPts.map((p) => p.x);
    const ys = keyPts.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const W = Math.max(maxX - minX, 1);
    const H = Math.max(maxY - minY, 1);

    const norm = keyPts.map((p) => ({
      x: (p.x - minX) / W,
      y: (p.y - minY) / H,
    }));

    // Build a feature vector: normalized x,y for all key points
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
  return Math.sqrt(sum / a.length); // RMSE per dimension
}

/**
 * Full face analysis result with CNN descriptor + landmark geometry.
 */
interface FaceAnalysis {
  descriptor: Float32Array;
  landmarkDesc: Float32Array | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detection: any;
}

/**
 * Try to extract face analysis using all available strategies.
 * Strategies ordered by quality: best resolution first, most permissive last.
 * Uses detectAllFaces for each strategy to catch faces missed by detectSingleFace.
 */
async function extractFullFaceAnalysis(
  imgEl: HTMLImageElement,
): Promise<FaceAnalysis | null> {
  const api = getFaceApi();
  if (!api) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tryDetectBest = async (options: any): Promise<FaceAnalysis | null> => {
    try {
      // First: try detectAllFaces and pick the largest/best-score detection
      const allDetections = await api
        .detectAllFaces(imgEl, options)
        .withFaceLandmarks()
        .withFaceDescriptors();

      if (allDetections && allDetections.length > 0) {
        // Pick the detection with the largest bounding box (most prominent face)
        const best = allDetections.reduce(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (prev: any, curr: any) => {
            const prevArea =
              (prev.detection?.box?.width ?? 0) *
              (prev.detection?.box?.height ?? 0);
            const currArea =
              (curr.detection?.box?.width ?? 0) *
              (curr.detection?.box?.height ?? 0);
            return currArea > prevArea ? curr : prev;
          },
          allDetections[0],
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

      // Fallback to detectSingleFace
      const single = await api
        .detectSingleFace(imgEl, options)
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
      // continue to next strategy
    }
    return null;
  };

  const strategies = [
    // 1. SsdMobilenetv1 at high confidence on full-res image (best quality)
    () => tryDetectBest(new api.SsdMobilenetv1Options({ minConfidence: 0.5 })),
    // 2. SsdMobilenetv1 at medium confidence
    () => tryDetectBest(new api.SsdMobilenetv1Options({ minConfidence: 0.3 })),
    // 3. TinyFaceDetector at 512px (good balance of speed/accuracy)
    () =>
      tryDetectBest(
        new api.TinyFaceDetectorOptions({
          inputSize: 512,
          scoreThreshold: 0.4,
        }),
      ),
    // 4. TinyFaceDetector at 416px
    () =>
      tryDetectBest(
        new api.TinyFaceDetectorOptions({
          inputSize: 416,
          scoreThreshold: 0.35,
        }),
      ),
    // 5. SsdMobilenetv1 at low confidence (catches partial/angled faces)
    () => tryDetectBest(new api.SsdMobilenetv1Options({ minConfidence: 0.15 })),
    // 6. TinyFaceDetector at 608px (large input for small faces)
    () =>
      tryDetectBest(
        new api.TinyFaceDetectorOptions({
          inputSize: 608,
          scoreThreshold: 0.25,
        }),
      ),
    // 7. SsdMobilenetv1 at very low threshold (last resort)
    () => tryDetectBest(new api.SsdMobilenetv1Options({ minConfidence: 0.05 })),
  ];

  for (const strategy of strategies) {
    const result = await strategy();
    if (result) return result;
  }
  return null;
}

/**
 * Detect whether a face is present (used for live camera indicator).
 */
export async function detectFaceInImage(
  imgEl: HTMLImageElement,
): Promise<boolean> {
  const api = getFaceApi();
  if (!api) return false;
  try {
    // detectAllFaces for robustness
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

function descriptorDistance(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

async function extractAnalysisWithAgeTransform(
  imgEl: HTMLImageElement,
  ageFactor: number,
): Promise<FaceAnalysis | null> {
  try {
    const imgData = await loadImageToCanvas(imgEl.src, 320, 320);
    const transformed = applyAgeProgression(imgData, ageFactor);
    const dataUrl = imageDataToDataUrl(transformed);
    const transformedImg = await loadHTMLImage(dataUrl);
    return extractFullFaceAnalysis(transformedImg);
  } catch {
    return null;
  }
}

/**
 * Comprehensive face match score:
 * - CNN 128-dim descriptor distance (primary signal)
 * - 68-point landmark geometry distance (secondary signal for face structure)
 * - Age-progression variants (aging + de-aging)
 * Returns -1 if no face detected in either image.
 */
async function cnnMatchScore(
  searchImg: HTMLImageElement,
  caseImg: HTMLImageElement,
): Promise<number> {
  const [searchAnalysis, caseAnalysis] = await Promise.all([
    extractFullFaceAnalysis(searchImg),
    extractFullFaceAnalysis(caseImg),
  ]);

  if (!caseAnalysis || !searchAnalysis) return -1;

  const scores: number[] = [];

  // -- CNN descriptor score (primary)
  const cnnDist = descriptorDistance(
    searchAnalysis.descriptor,
    caseAnalysis.descriptor,
  );
  const baseCnnScore = distanceToScore(cnnDist);
  scores.push(baseCnnScore);

  // -- Landmark geometry score (structural face matching)
  if (searchAnalysis.landmarkDesc && caseAnalysis.landmarkDesc) {
    const lmDist = landmarkDistance(
      searchAnalysis.landmarkDesc,
      caseAnalysis.landmarkDesc,
    );
    // Landmark RMSE: <= 0.04 = excellent, <= 0.08 = good, > 0.15 = poor
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

    // Blend CNN + landmark geometry: 70% CNN + 30% landmark
    const blended = Math.round(baseCnnScore * 0.7 + lmScore * 0.3);
    scores.push(blended);
  }

  // -- Mild age progression: only if base score is already close (>= 30)
  // Using very mild factor (0.15) to avoid distorting descriptors for different children
  const blendedBase =
    scores.length > 1 ? scores[scores.length - 1] : baseCnnScore;
  if (blendedBase >= 30) {
    const [mildAged, mildYoung] = await Promise.all([
      extractAnalysisWithAgeTransform(searchImg, 0.15),
      extractAnalysisWithAgeTransform(searchImg, -0.15),
    ]);
    if (mildAged) {
      const d = descriptorDistance(
        mildAged.descriptor,
        caseAnalysis.descriptor,
      );
      scores.push(distanceToScore(d));
    }
    if (mildYoung) {
      const d = descriptorDistance(
        mildYoung.descriptor,
        caseAnalysis.descriptor,
      );
      scores.push(distanceToScore(d));
    }
  }

  return Math.max(...scores);
}

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
      const imgData = await loadImageToCanvas(
        searchDataUrl,
        CANVAS_SIZE,
        CANVAS_SIZE,
      );
      const aged = applyAgeProgression(imgData, 0.6);
      onAgeProgressedDataUrl(imageDataToDataUrl(aged));
    }

    // Histogram score (always computed -- used for ensemble or fallback)
    const [searchImageData, caseImageData] = await Promise.all([
      loadImageToCanvas(searchDataUrl),
      loadImageToCanvas(casePhotoUrl),
    ]);
    const histRaw = histogramIntersection(
      extractHistogram(searchImageData),
      extractHistogram(caseImageData),
    );
    const _histScore = Math.max(
      0,
      Math.min(100, Math.round(((histRaw - 0.3) / 0.5) * 100)),
    );

    if (modelsLoaded) {
      // Load images at full natural size for best detection quality
      // Also prepare a preprocessed version as backup
      const [searchImgNatural, caseImgNatural] = await Promise.all([
        loadHTMLImageNatural(searchDataUrl),
        loadHTMLImageNatural(casePhotoUrl),
      ]);

      const cnnScore = await cnnMatchScore(searchImgNatural, caseImgNatural);

      if (cnnScore >= 0) {
        // Weighted ensemble: CNN+landmark (90%) + histogram (10%)
        return Math.round(cnnScore);
      }

      // CNN got no face -- try preprocessed versions before giving up
      const [searchPrep, casePrep] = await Promise.all([
        preprocessImageForFace(searchDataUrl, 320).catch(() =>
          loadHTMLImage(searchDataUrl),
        ),
        preprocessImageForFace(casePhotoUrl, 320).catch(() =>
          loadHTMLImage(casePhotoUrl),
        ),
      ]);
      const cnnScore2 = await cnnMatchScore(searchPrep, casePrep);
      if (cnnScore2 >= 0) {
        return Math.round(cnnScore2);
      }

      // No face detected anywhere -- do NOT use histogram (causes wrong matches)
      return 0;
    }

    // Models not loaded -- histogram only with age variants
    const caseHist = extractHistogram(caseImageData);
    const histScores = [
      histogramIntersection(extractHistogram(searchImageData), caseHist),
      histogramIntersection(
        extractHistogram(applyAgeProgression(searchImageData, 0.6)),
        caseHist,
      ),
      histogramIntersection(
        extractHistogram(applyAgeProgression(searchImageData, -0.5)),
        caseHist,
      ),
      histogramIntersection(
        extractHistogram(searchImageData),
        extractHistogram(applyAgeProgression(caseImageData, 0.6)),
      ),
    ];

    const bestHistRaw = Math.max(...histScores);
    const rawScore = Math.max(
      0,
      Math.min(100, Math.round(((bestHistRaw - 0.3) / 0.5) * 100)),
    );
    return Math.round(rawScore * 0.35);
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
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    sum += gray;
    sumSq += gray * gray;
  }

  const mean = sum / pixels;
  return sumSq / pixels - mean * mean;
}
