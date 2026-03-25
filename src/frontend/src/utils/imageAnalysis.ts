const CANVAS_SIZE = 64;
const BINS = 32;
const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model";
const FACEAPI_CDN =
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js";

let modelsLoaded = false;
let modelsLoading: Promise<void> | null = null;

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

export async function ensureModelsLoaded(): Promise<void> {
  if (modelsLoaded) return;
  if (modelsLoading) return modelsLoading;

  modelsLoading = (async () => {
    try {
      await loadScript(FACEAPI_CDN);
      const api = getFaceApi();
      if (!api) return;
      await Promise.all([
        api.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        api.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        api.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
        api.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      modelsLoaded = true;
    } catch {
      // Models failed to load; will fall back to histogram
    }
  })();

  return modelsLoading;
}

export function areModelsLoaded(): boolean {
  return modelsLoaded;
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

async function extractFaceDescriptor(
  imgEl: HTMLImageElement,
): Promise<Float32Array | null> {
  const api = getFaceApi();
  if (!api) return null;
  try {
    // First attempt: TinyFaceDetector (fast)
    let detection = await api
      .detectSingleFace(
        imgEl,
        new api.TinyFaceDetectorOptions({ scoreThreshold: 0.3 }),
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

/**
 * Convert face-api Euclidean distance to 0-100 score.
 * face-api distances: <0.4 = same person, 0.4-0.6 = likely same, >0.6 = different
 * Map: 0.0 -> 100, 0.4 -> 85, 0.6 -> 50, 1.0 -> 0
 */
function distanceToScore(distance: number): number {
  if (distance <= 0.4) return Math.round(85 + ((0.4 - distance) / 0.4) * 15);
  if (distance <= 0.6) return Math.round(50 + ((0.6 - distance) / 0.2) * 35);
  return Math.max(0, Math.round(50 - ((distance - 0.6) / 0.4) * 50));
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
      const [searchImg, caseImg] = await Promise.all([
        loadHTMLImage(searchDataUrl),
        loadHTMLImage(casePhotoUrl),
      ]);

      const cnnScore = await cnnMatchScore(searchImg, caseImg);
      if (cnnScore >= 0) {
        return cnnScore;
      }
    }

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
    const normalized = Math.max(
      0,
      Math.min(100, Math.round(((bestHistScore - 0.3) / 0.5) * 100)),
    );
    return normalized;
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
