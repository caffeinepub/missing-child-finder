const CANVAS_SIZE = 64;
const BINS = 32;

const MODEL_URLS = [
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model",
  "https://cdn.jsdelivr.net/npm/face-api.js/weights",
];

const FACEAPI_CDNS = [
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js",
  "https://unpkg.com/@vladmandic/face-api/dist/face-api.js",
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

function getFaceApi(): any {
  return typeof window !== "undefined" ? window.faceapi : null;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

async function loadScriptWithFallback(): Promise<void> {
  let lastError: Error | null = null;
  for (const cdn of FACEAPI_CDNS) {
    try {
      await loadScript(cdn);
      return;
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
    api.nets.faceLandmark68TinyNet.loadFromUri(modelUrl),
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
          // try next
        }
      }
      if (loaded) {
        modelsLoaded = true;
        modelLoadError = null;
      } else {
        modelLoadError =
          "Could not load face recognition models. Using histogram fallback.";
      }
    } catch (e) {
      modelLoadError = (e as Error).message ?? "Model load failed";
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
 * Preprocess image for better face detection:
 * - Resize to 224x224
 * - Apply contrast normalization using 2nd/98th percentile stretch
 */
export async function preprocessImageForFace(
  src: string,
): Promise<HTMLImageElement> {
  const imageData = await loadImageToCanvas(src, 224, 224);
  const data = imageData.data;

  // Collect grayscale values for percentile calculation
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

  // Apply per-channel stretch based on same percentile range
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
  canvas.width = 224;
  canvas.height = 224;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(imageData, 0, 0);

  return loadHTMLImage(canvas.toDataURL("image/jpeg", 0.92));
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
 * ageFactor > 0 = age forward, ageFactor < 0 = de-age (make younger)
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
  return canvas.toDataURL("image/jpeg", 0.85);
}

/**
 * Improved distance-to-score calibration.
 * distance <= 0.30 → 95-100 (very high confidence)
 * distance <= 0.45 → 70-94 (likely match)
 * distance <= 0.60 → 40-69 (possible match)
 * distance > 0.60  → 0-39 (low)
 */
function distanceToScore(distance: number): number {
  if (distance <= 0.3) {
    return Math.round(95 + ((0.3 - distance) / 0.3) * 5);
  }
  if (distance <= 0.45) {
    return Math.round(70 + ((0.45 - distance) / 0.15) * 24);
  }
  if (distance <= 0.6) {
    return Math.round(40 + ((0.6 - distance) / 0.15) * 29);
  }
  return Math.max(0, Math.round(40 - ((distance - 0.6) / 0.4) * 40));
}

async function extractFaceDescriptor(
  imgEl: HTMLImageElement,
): Promise<Float32Array | null> {
  const api = getFaceApi();
  if (!api) return null;
  try {
    // First attempt: TinyFaceDetector with higher input size for better accuracy
    let detection = await api
      .detectSingleFace(
        imgEl,
        new api.TinyFaceDetectorOptions({
          inputSize: 416,
          scoreThreshold: 0.4,
        }),
      )
      .withFaceLandmarks(true)
      .withFaceDescriptor();

    // Second attempt: SsdMobilenetv1 (more accurate, higher recall)
    if (!detection) {
      detection = await api
        .detectSingleFace(
          imgEl,
          new api.SsdMobilenetv1Options({ minConfidence: 0.3 }),
        )
        .withFaceLandmarks(true)
        .withFaceDescriptor();
    }

    return detection?.descriptor ?? null;
  } catch {
    return null;
  }
}

/**
 * Detect whether a face is present in an image using TinyFaceDetector or SsdMobilenetv1.
 */
export async function detectFaceInImage(
  imgEl: HTMLImageElement,
): Promise<boolean> {
  const api = getFaceApi();
  if (!api) return false;
  try {
    let detection = await api.detectSingleFace(
      imgEl,
      new api.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 }),
    );
    if (!detection) {
      detection = await api.detectSingleFace(
        imgEl,
        new api.SsdMobilenetv1Options({ minConfidence: 0.3 }),
      );
    }
    return !!detection;
  } catch {
    return false;
  }
}

async function extractDescriptorWithAgeTransform(
  imgEl: HTMLImageElement,
  ageFactor: number,
): Promise<Float32Array | null> {
  const imgData = await loadImageToCanvas(imgEl.src, 224, 224);
  const transformed = applyAgeProgression(imgData, ageFactor);
  const dataUrl = imageDataToDataUrl(transformed);
  const transformedImg = await loadHTMLImage(dataUrl);
  return extractFaceDescriptor(transformedImg);
}

function descriptorDistance(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

async function cnnMatchScore(
  searchImg: HTMLImageElement,
  caseImg: HTMLImageElement,
): Promise<number> {
  const [searchDesc, caseDesc] = await Promise.all([
    extractFaceDescriptor(searchImg),
    extractFaceDescriptor(caseImg),
  ]);

  const scores: number[] = [];

  if (searchDesc && caseDesc) {
    scores.push(distanceToScore(descriptorDistance(searchDesc, caseDesc)));

    const agedSearchDesc = await extractDescriptorWithAgeTransform(
      searchImg,
      0.6,
    );
    if (agedSearchDesc) {
      scores.push(
        distanceToScore(descriptorDistance(agedSearchDesc, caseDesc)),
      );
    }

    const youngSearchDesc = await extractDescriptorWithAgeTransform(
      searchImg,
      -0.5,
    );
    if (youngSearchDesc) {
      scores.push(
        distanceToScore(descriptorDistance(youngSearchDesc, caseDesc)),
      );
    }

    const agedCaseDesc = await extractDescriptorWithAgeTransform(caseImg, 0.6);
    if (agedCaseDesc) {
      scores.push(
        distanceToScore(descriptorDistance(searchDesc, agedCaseDesc)),
      );
    }
  }

  if (scores.length === 0) return -1;
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

    if (modelsLoaded) {
      // Use preprocessed images for better face detection accuracy
      const [searchImg, caseImg] = await Promise.all([
        preprocessImageForFace(searchDataUrl).catch(() =>
          loadHTMLImage(searchDataUrl),
        ),
        preprocessImageForFace(casePhotoUrl).catch(() =>
          loadHTMLImage(casePhotoUrl),
        ),
      ]);

      const cnnScore = await cnnMatchScore(searchImg, caseImg);

      // Compute histogram similarity for ensemble
      const [searchImageData, caseImageData] = await Promise.all([
        loadImageToCanvas(searchDataUrl),
        loadImageToCanvas(casePhotoUrl),
      ]);
      const histRaw = histogramIntersection(
        extractHistogram(searchImageData),
        extractHistogram(caseImageData),
      );
      const histScore = Math.max(
        0,
        Math.min(100, Math.round(((histRaw - 0.3) / 0.5) * 100)),
      );

      if (cnnScore >= 0) {
        // Weighted ensemble: CNN (85%) + histogram (15%)
        return Math.round(cnnScore * 0.85 + histScore * 0.15);
      }

      // CNN got no face, use histogram only
      return histScore;
    }

    // Models not loaded — histogram only
    const [searchImageData, caseImageData] = await Promise.all([
      loadImageToCanvas(searchDataUrl),
      loadImageToCanvas(casePhotoUrl),
    ]);

    const histScores: number[] = [];
    const caseHist = extractHistogram(caseImageData);

    histScores.push(
      histogramIntersection(extractHistogram(searchImageData), caseHist),
    );
    histScores.push(
      histogramIntersection(
        extractHistogram(applyAgeProgression(searchImageData, 0.6)),
        caseHist,
      ),
    );
    histScores.push(
      histogramIntersection(
        extractHistogram(applyAgeProgression(searchImageData, -0.5)),
        caseHist,
      ),
    );
    histScores.push(
      histogramIntersection(
        extractHistogram(searchImageData),
        extractHistogram(applyAgeProgression(caseImageData, 0.6)),
      ),
    );

    const bestHistScore = Math.max(...histScores);
    return Math.max(
      0,
      Math.min(100, Math.round(((bestHistScore - 0.3) / 0.5) * 100)),
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
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    sum += gray;
    sumSq += gray * gray;
  }

  const mean = sum / pixels;
  return sumSq / pixels - mean * mean;
}
