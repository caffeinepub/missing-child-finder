# Missing Child Finder

## Current State
Face detection pipeline uses face-api.js (CNN) + BlazeFace + YOLOv8-ONNX + age progression. `extractFaceAnalysis` is called once per registered case for the same search image (O(n) redundant work). Detection strategies run sequentially (8 in a row). Age progression adds 3 more rounds per case.

## Requested Changes (Diff)

### Add
- Search image face analysis cache: analyze search image once, reuse result for all N registered cases
- Parallel detection: race fast strategies (TinyFaceDetector 416px vs SsdMobilenetv1 50%) simultaneously instead of sequentially
- BlazeFace/YOLOv8 crop attempted in parallel with the initial sequential strategies

### Modify
- `computeMatchScore` to accept a pre-cached `FaceAnalysis` object so repeated calls reuse search face data
- `compareFacePair` to accept pre-extracted search face analysis directly (skip re-detection)
- `compareWithAgeProgression` to accept pre-extracted search face analysis
- Detection strategies: group into tiers — run tier-1 (fast detectors) concurrently, only go to tier-2 (permissive thresholds) if tier-1 fails
- CNN threshold raised to 0.72 for better same-person-in-different-lighting coverage

### Remove
- Nothing removed

## Implementation Plan
1. Add `extractSearchFaceOnce(searchDataUrl)` exported function that caches `FaceAnalysis | null` by URL
2. Refactor `extractFaceAnalysis` to use parallel strategy groups
3. Refactor `compareFacePair` / `compareWithAgeProgression` to accept optional pre-computed search face
4. Update `computeMatchScore` to extract search face once at the top, pass it to all case comparisons
5. Export a `clearSearchFaceCache()` helper so SearchPage can clear it between searches
