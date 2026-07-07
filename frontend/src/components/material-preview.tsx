"use client";

type MaterialPreviewProps = {
  albedoUrl: string;
};

export function MaterialPreview({ albedoUrl }: MaterialPreviewProps) {
  return (
    <div className="preview-shell">
      <div className="preview-card">
        <div className="preview-label">Sphere preview</div>
        <div
          className="preview-sphere"
          style={{ backgroundImage: `url(${albedoUrl})` }}
          aria-label="Sphere preview"
        >
          <div className="preview-sphere-shade" />
        </div>
      </div>

      <div className="preview-card">
        <div className="preview-label">Tiled plane</div>
        <div className="preview-plane-wrap">
          <div
            className="preview-plane"
            style={{ backgroundImage: `url(${albedoUrl})` }}
            aria-label="Plane preview"
          />
        </div>
      </div>
    </div>
  );
}
