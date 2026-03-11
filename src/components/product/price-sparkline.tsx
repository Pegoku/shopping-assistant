type PriceSparklineProps = {
  values: number[];
};

export function PriceSparkline({ values }: PriceSparklineProps) {
  if (!values.length) {
    return null;
  }

  const width = 160;
  const height = 44;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg className="w-full h-11 text-teal-600" viewBox={`0 0 ${width} ${height}`} role="img">
      <polyline fill="none" points={points} stroke="currentColor" strokeWidth="3" />
    </svg>
  );
}
