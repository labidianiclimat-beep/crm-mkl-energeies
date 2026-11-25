"use client";

import { useEffect, useRef } from "react";
import { Eraser, Signature } from "lucide-react";

function paintCanvas(canvas, dataUrl) {
  if (!canvas) return;
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#152347";
  if (!dataUrl) return;
  const image = new Image();
  image.onload = () => ctx.drawImage(image, 0, 0, width, height);
  image.src = dataUrl;
}

export default function SignaturePad({
  name,
  title = "Signature",
  value = "",
  onChange,
  hint = "Signer avec le doigt ou le stylet",
}) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => paintCanvas(canvasRef.current, value));
    return () => cancelAnimationFrame(frame);
  }, [value]);

  function point(event) {
    const rect = canvasRef.current.getBoundingClientRect();
    const source = event.touches?.[0] || event;
    return { x: source.clientX - rect.left, y: source.clientY - rect.top };
  }

  function start(event) {
    event.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current.getContext("2d");
    const next = point(event);
    ctx.beginPath();
    ctx.moveTo(next.x, next.y);
  }

  function move(event) {
    if (!drawing.current) return;
    event.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const next = point(event);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
  }

  function stop() {
    if (!drawing.current) return;
    drawing.current = false;
    onChange?.(canvasRef.current.toDataURL("image/png"));
  }

  function clear() {
    drawing.current = false;
    paintCanvas(canvasRef.current, "");
    onChange?.("");
  }

  return (
    <div className="quote-signature-pad">
      <div className="quote-signature-pad-head">
        <Signature size={16} />
        <b>{title}</b>
        <button type="button" onClick={clear}><Eraser size={14} />Effacer</button>
      </div>
      <canvas
        ref={canvasRef}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={stop}
        onMouseLeave={stop}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={stop}
      />
      <input type="hidden" name={name} value={value || ""} />
      <small>{hint}</small>
    </div>
  );
}
