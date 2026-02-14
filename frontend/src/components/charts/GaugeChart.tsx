import { formatCurrency } from '../../lib/formatters';

interface Props {
  /** Total budget (full arc) */
  total: number;
  /** Amount spent (needle position) */
  spent: number;
  /** Label shown below the gauge */
  label: string;
}

export default function GaugeChart({ total, spent, label }: Props) {
  const percentage = total > 0 ? Math.min((spent / total) * 100, 100) : 0;

  // SVG dimensions — large gauge
  const cx = 180;
  const cy = 160;
  const radius = 130;
  const strokeWidth = 26;

  // Arc from 180° to 0° (left to right, bottom half is the opening)
  const startAngle = 180;
  const endAngle = 0;
  const totalArc = startAngle - endAngle; // 180

  // Convert angle to radians
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  // Point on arc
  const pointOnArc = (angleDeg: number) => ({
    x: cx + radius * Math.cos(toRad(angleDeg)),
    y: cy - radius * Math.sin(toRad(angleDeg)),
  });

  // Background arc path (full semicircle)
  const bgStart = pointOnArc(startAngle);
  const bgEnd = pointOnArc(endAngle);
  const bgPath = `M ${bgStart.x} ${bgStart.y} A ${radius} ${radius} 0 0 1 ${bgEnd.x} ${bgEnd.y}`;

  // Filled arc path (up to percentage)
  const fillAngle = startAngle - (percentage / 100) * totalArc;
  const fillEnd = pointOnArc(fillAngle);
  const largeArc = percentage > 50 ? 1 : 0;
  const fillPath = `M ${bgStart.x} ${bgStart.y} A ${radius} ${radius} 0 ${largeArc} 1 ${fillEnd.x} ${fillEnd.y}`;

  // Needle
  const needleLength = radius - 14;
  const needleAngle = startAngle - (percentage / 100) * totalArc;
  const needleTip = {
    x: cx + needleLength * Math.cos(toRad(needleAngle)),
    y: cy - needleLength * Math.sin(toRad(needleAngle)),
  };

  // Color based on percentage
  const getColor = () => {
    if (percentage >= 90) return '#dc2626'; // red
    if (percentage >= 70) return '#f59e0b'; // amber
    return '#6366f1'; // indigo
  };

  const color = getColor();

  return (
    <div className="flex flex-col items-center w-full">
      <svg width="100%" viewBox="0 0 360 185" preserveAspectRatio="xMidYMid meet">
        {/* Background arc */}
        <path
          d={bgPath}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Filled arc */}
        {percentage > 0 && (
          <path
            d={fillPath}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        )}

        {/* Needle */}
        <line
          x1={cx}
          y1={cy}
          x2={needleTip.x}
          y2={needleTip.y}
          stroke="#1f2937"
          strokeWidth={3}
          strokeLinecap="round"
        />

        {/* Center circle */}
        <circle cx={cx} cy={cy} r={8} fill="#1f2937" />
        <circle cx={cx} cy={cy} r={4} fill="white" />

        {/* Percentage text */}
        <text
          x={cx}
          y={cy - 40}
          textAnchor="middle"
          fill="#1f2937"
          fontSize="32"
          fontWeight="700"
        >
          {Math.round(percentage)}%
        </text>
      </svg>

      {/* Label */}
      <p className="text-base font-semibold text-gray-700 -mt-3">{label}</p>
      <p className="text-sm text-gray-400 mt-0.5">
        €{formatCurrency(spent)} / €{formatCurrency(total)}
      </p>
    </div>
  );
}
