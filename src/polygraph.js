// Лента полиграфа. Амплитуда зависит от числа конфликтов на поле:
// чем больше противоречий, тем сильнее дёргается перо.
export function createPolygraph(canvas) {
  const context = canvas.getContext('2d');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const samples = [];
  let tension = 0;
  let spike = 0;
  let phase = 0;
  let width = 0;
  let height = 0;

  const resize = () => {
    const ratio = window.devicePixelRatio || 1;
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  };

  const sample = () => {
    phase += 0.13;
    const wave = Math.sin(phase) * 0.45 + Math.sin(phase * 2.7) * 0.3 + Math.sin(phase * 0.37) * 0.25;
    const amplitude = 0.1 + Math.min(tension, 12) * 0.06;
    const jitter = (Math.random() - 0.5) * amplitude * 0.8;
    const kick = spike * (samples.length % 2 ? 1 : -1);
    spike *= 0.72;
    return Math.max(-1, Math.min(1, wave * amplitude + jitter + kick));
  };

  const draw = () => {
    const style = getComputedStyle(canvas);
    context.clearRect(0, 0, width, height);
    context.strokeStyle = style.getPropertyValue('--trace-grid');
    context.lineWidth = 1;
    context.beginPath();
    for (let x = 12; x < width; x += 12) {
      context.moveTo(x + 0.5, 0);
      context.lineTo(x + 0.5, height);
    }
    for (let y = 12; y < height; y += 12) {
      context.moveTo(0, y + 0.5);
      context.lineTo(width, y + 0.5);
    }
    context.stroke();

    const needle = width - 18;
    context.strokeStyle = style.getPropertyValue('--pen');
    context.lineWidth = 1.6;
    context.lineJoin = 'round';
    context.beginPath();
    samples.forEach((value, index) => {
      const x = needle - (samples.length - 1 - index) * 2;
      const y = height / 2 - (value * height) / 2.3;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
  };

  const push = () => {
    samples.push(sample());
    const capacity = Math.ceil(width / 2) + 2;
    while (samples.length > capacity) samples.shift();
  };

  const prefill = () => {
    samples.length = 0;
    const capacity = Math.ceil(width / 2) + 2;
    for (let i = 0; i < capacity; i++) push();
  };

  let tick = 0;
  const loop = () => {
    tick++;
    if (!document.hidden && tick % 3 === 0) {
      push();
      draw();
    }
    requestAnimationFrame(loop);
  };

  resize();
  prefill();
  draw();
  addEventListener('resize', () => {
    resize();
    prefill();
    draw();
  });
  if (!reduceMotion) requestAnimationFrame(loop);

  return {
    setTension(value) {
      tension = value;
      if (reduceMotion) {
        prefill();
        draw();
      }
    },
    jolt(strength = 0.8) {
      spike = strength;
    },
    redraw: draw,
  };
}
