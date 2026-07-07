"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";

import { MaterialPreview } from "@/components/material-preview";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") ?? "http://127.0.0.1:8000";

const MATERIAL_OPTIONS = [
  { value: "auto", label: "Auto-detect" },
  { value: "leather", label: "Leather" },
  { value: "wood", label: "Wood" },
  { value: "fabric", label: "Fabric" },
  { value: "stone", label: "Stone" },
  { value: "metal", label: "Metal" },
  { value: "concrete", label: "Concrete" },
  { value: "plastic", label: "Plastic" },
] as const;

type ProcessResult = {
  jobId: string;
  detectedMaterial: string;
  effectiveMaterial: string;
  sourceResolution: { width: number; height: number };
  materialProfile: {
    label: string;
    summary: string;
    baseRoughness: number;
    metallic: number;
  };
  scale: {
    surfaceWidthCm: number;
    mappingScale: number;
  };
  seamQuality: number;
  notes: string[];
  maps: Record<string, string>;
  scriptUrl: string;
  readmeUrl: string;
  downloadUrl: string;
};

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [material, setMaterial] = useState("auto");
  const [surfaceWidth, setSurfaceWidth] = useState("30");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl);
      }
    };
  }, [localPreviewUrl]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Choose a source image before processing.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("material_override", material);

    if (surfaceWidth.trim()) {
      formData.append("surface_width_cm", surfaceWidth);
    }

    try {
      const response = await fetch(`${API_BASE}/api/process`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { detail?: string }
          | null;
        throw new Error(payload?.detail ?? "Processing failed.");
      }

      const payload = (await response.json()) as ProcessResult;
      setResult(payload);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Something went wrong while processing the image.",
      );
    } finally {
      setIsProcessing(false);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    setFile(nextFile);
    setLocalPreviewUrl((currentUrl) => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }

      return nextFile ? URL.createObjectURL(nextFile) : null;
    });
    setResult(null);
    setError(null);
  }

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Photo-to-PBR MVP</p>
          <h1>Turn one surface photo into a Blender-ready material package.</h1>
          <p className="lede">
            Upload a close-up photo, let the app flatten lighting and build
            seamless texture maps, then preview the material and export a zip
            with Blender textures plus a `bpy` shader generator.
          </p>
        </div>

        <div className="hero-panel">
          <div className="hero-stat">
            <span>Outputs</span>
            <strong>Albedo, Roughness, Normal, Height, AO, Metallic</strong>
          </div>
          <div className="hero-stat">
            <span>Delivery</span>
            <strong>Browser preview + Blender script + zip package</strong>
          </div>
          <div className="hero-stat">
            <span>Architecture</span>
            <strong>Next.js frontend and FastAPI backend</strong>
          </div>
        </div>
      </section>

      <section className="workspace-grid">
        <form className="control-panel" onSubmit={handleSubmit}>
          <div className="panel-header">
            <h2>Material Input</h2>
            <p>
              This MVP uses deterministic image-processing heuristics and keeps
              the workflow fast, simple, and ready for future AI upgrades.
            </p>
          </div>

          <label className="field">
            <span>Source photo</span>
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
            />
          </label>

          <label className="field">
            <span>Material type</span>
            <select value={material} onChange={(event) => setMaterial(event.target.value)}>
              {MATERIAL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Approximate surface width in cm</span>
            <input
              type="number"
              min="1"
              step="0.5"
              value={surfaceWidth}
              onChange={(event) => setSurfaceWidth(event.target.value)}
            />
          </label>

          <button className="process-button" type="submit" disabled={isProcessing}>
            {isProcessing ? "Generating maps..." : "Generate PBR Package"}
          </button>

          {error ? <p className="error-text">{error}</p> : null}

          <div className="checklist">
            <div>Accepts JPG, PNG, and WEBP up to 20MB.</div>
            <div>Normalizes low-res input toward the 1K minimum target.</div>
            <div>Exports a Blender 4.x compatible material build script.</div>
          </div>
        </form>

        <div className="preview-panel">
          <div className="panel-header">
            <h2>Live Preview</h2>
            <p>
              A quick browser-side look at the source texture before processing
              and the generated material after the pipeline runs.
            </p>
          </div>

          {result ? (
            <MaterialPreview albedoUrl={result.maps.albedo} />
          ) : localPreviewUrl ? (
            <div className="local-preview">
              <div className="preview-label">Uploaded source</div>
              <div
                className="preview-plane flat-preview"
                style={{ backgroundImage: `url(${localPreviewUrl})` }}
              />
            </div>
          ) : (
            <div className="empty-preview">
              Upload a tightly cropped material photo to see it here.
            </div>
          )}
        </div>
      </section>

      {result ? (
        <section className="results-panel">
          <div className="results-header">
            <div>
              <p className="eyebrow">Generated Package</p>
              <h2>{result.materialProfile.label} material ready for export</h2>
            </div>
            <a className="download-button" href={result.downloadUrl}>
              Download zip
            </a>
          </div>

          <div className="result-metrics">
            <div>
              <span>Detected</span>
              <strong>{result.detectedMaterial}</strong>
            </div>
            <div>
              <span>Using</span>
              <strong>{result.effectiveMaterial}</strong>
            </div>
            <div>
              <span>Seam score</span>
              <strong>{result.seamQuality}</strong>
            </div>
            <div>
              <span>Scale</span>
              <strong>{result.scale.surfaceWidthCm} cm</strong>
            </div>
          </div>

          <p className="result-summary">{result.materialProfile.summary}</p>

          <div className="map-grid">
            {Object.entries(result.maps).map(([mapName, mapUrl]) => (
              <article key={mapName} className="map-card">
                <div className="map-card-header">
                  <h3>{mapName}</h3>
                  <a href={mapUrl} target="_blank" rel="noreferrer">
                    Open
                  </a>
                </div>
                <div
                  className="map-swatch"
                  style={{ backgroundImage: `url(${mapUrl})` }}
                />
              </article>
            ))}
          </div>

          <div className="export-links">
            <a href={result.scriptUrl} target="_blank" rel="noreferrer">
              Blender script
            </a>
            <a href={result.readmeUrl} target="_blank" rel="noreferrer">
              Readme
            </a>
          </div>

          <div className="notes-list">
            {result.notes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
