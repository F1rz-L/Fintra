"use client"

import React, { useEffect, useMemo, useRef } from 'react';
import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions,
  type Plugin,
} from 'chart.js';

Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend
);

interface DailyEntry {
  date: string;
  amount: number; // positive = inflow, negative = outflow
}

// Deterministic generator for 100 sparse daily entries (60 realized, 40 planned)
function generateDummyTransactions(count = 100, realizedCount = 60): {
  realizedEntries: DailyEntry[];
  plannedEntries: DailyEntry[];
} {
  const realizedEntries: DailyEntry[] = [];
  const plannedEntries: DailyEntry[] = [];

  const startDate = new Date(2026, 5, 1); // Jun 1, 2026
  const current = new Date(startDate);

  for (let i = 0; i < count; i++) {
    // Advance 1 to 3 days per entry so dates remain sparse rather than every calendar day
    const dayStep = (i % 3) + 1;
    current.setDate(current.getDate() + dayStep);

    const dateLabel = current.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });

    // Deterministic pseudo-random signed amounts (-12,000 to +24,000)
    const wave = Math.sin(i * 0.65) * 11000 + Math.cos(i * 1.3) * 6500;
    const isOutflow = (i * 7 + 3) % 5 === 0 || wave < -2500;
    const magnitude = Math.round((Math.abs(wave) + 2500) / 100) * 100;
    const amount = isOutflow ? -Math.min(magnitude, 14000) : Math.min(magnitude, 24000);

    if (i < realizedCount) {
      realizedEntries.push({ date: dateLabel, amount });
    } else {
      plannedEntries.push({ date: dateLabel, amount });
    }
  }

  return { realizedEntries, plannedEntries };
}

export default function Project() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<Chart<'bar', (number | null)[], string> | null>(null);

  const { realizedEntries, plannedEntries } = useMemo(
    () => generateDummyTransactions(100, 60),
    []
  );

  const realizedNet = useMemo(
    () => realizedEntries.reduce((acc, item) => acc + item.amount, 0),
    [realizedEntries]
  );
  const plannedNet = useMemo(
    () => plannedEntries.reduce((acc, item) => acc + item.amount, 0),
    [plannedEntries]
  );
  const totalNet = realizedNet + plannedNet;

  const formatSigned = (value: number) => {
    const sign = value > 0 ? '+' : value < 0 ? '-' : '';
    return `${sign}$${Math.abs(value).toLocaleString()}`;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const labels = [
      ...realizedEntries.map((d) => d.date),
      ...plannedEntries.map((d) => d.date),
    ];

    const splitIndex = realizedEntries.length;

    const realizedValues: (number | null)[] = [
      ...realizedEntries.map((d) => d.amount),
      ...plannedEntries.map(() => null),
    ];

    const plannedValues: (number | null)[] = [
      ...realizedEntries.map(() => null),
      ...plannedEntries.map((d) => d.amount),
    ];

    const sectionDividerPlugin: Plugin<'bar'> = {
      id: 'sectionDivider',
      beforeDatasetsDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        if (!chartArea || !scales.x || splitIndex === 0 || splitIndex >= labels.length) {
          return;
        }

        const prevX = scales.x.getPixelForValue(splitIndex - 1);
        const nextX = scales.x.getPixelForValue(splitIndex);
        const dividerX = (prevX + nextX) / 2;

        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
        ctx.moveTo(dividerX, chartArea.top);
        ctx.lineTo(dividerX, chartArea.bottom);
        ctx.stroke();

        ctx.font = '10px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = 'rgba(148, 163, 184, 0.75)';
        ctx.textAlign = 'right';
        ctx.fillText('REALIZED', dividerX - 6, chartArea.top + 10);
        ctx.textAlign = 'left';
        ctx.fillText('PLANNED', dividerX + 6, chartArea.top + 10);
        ctx.restore();
      },
    };

    const data: ChartData<'bar', (number | null)[], string> = {
      labels,
      datasets: [
        {
          label: 'Realized',
          data: realizedValues,
          grouped: false,
          barPercentage: 0.85,
          categoryPercentage: 0.9,
          borderRadius: 2,
          backgroundColor: (ctx) => {
            const val = ctx.raw as number | null;
            if (val === null) return 'transparent';
            return val < 0
              ? 'rgba(244, 63, 94, 0.7)'
              : 'rgba(16, 185, 129, 0.75)';
          },
        },
        {
          label: 'Planned',
          data: plannedValues,
          grouped: false,
          barPercentage: 0.85,
          categoryPercentage: 0.9,
          borderRadius: 2,
          backgroundColor: (ctx) => {
            const val = ctx.raw as number | null;
            if (val === null) return 'transparent';
            return val < 0
              ? 'rgba(251, 113, 133, 0.3)'
              : 'rgba(99, 102, 241, 0.32)';
          },
          borderColor: (ctx) => {
            const val = ctx.raw as number | null;
            if (val === null) return 'transparent';
            return val < 0
              ? 'rgba(244, 63, 94, 0.65)'
              : 'rgba(99, 102, 241, 0.7)';
          },
          borderWidth: 0.75,
        },
      ],
    };

    const options: ChartOptions<'bar'> = {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 250,
      },
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const val = context.parsed.y;
              if (val === null || val === undefined) return '';
              const kind = val < 0 ? 'Outflow' : 'Inflow';
              return `${context.dataset.label} (${kind}): ${formatSigned(val)}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: {
            display: false,
          },
          border: {
            display: false,
          },
          ticks: {
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 8,
            font: {
              size: 11,
            },
          },
        },
        y: {
          border: {
            display: false,
          },
          grid: {
            color: (ctx) =>
              ctx.tick?.value === 0
                ? 'rgba(148, 163, 184, 0.45)'
                : 'rgba(148, 163, 184, 0.12)',
          },
          ticks: {
            maxTicksLimit: 5,
            font: {
              size: 11,
            },
            callback: (value) => {
              const num = Number(value);
              if (num === 0) return '0';
              const sign = num < 0 ? '-' : '';
              return `${sign}$${Math.abs(num / 1000)}k`;
            },
          },
        },
      },
    };

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    chartInstanceRef.current = new Chart(canvas, {
      type: 'bar',
      data,
      options,
      plugins: [sectionDividerPlugin],
    });

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, [realizedEntries, plannedEntries]);

  return (
    <div className="card card-border bg-base-200/80 w-full flex flex-col md:flex-row">
      <div className="card-body flex-2 justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <h2 className="card-title text-base font-semibold tracking-tight">
              Projek ###
            </h2>
          </div>
          <p className="text-xs opacity-70 leading-relaxed">
            Sparse daily inflows and outflows across completed and scheduled milestones.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-1">
          <div className="rounded-box bg-base-100/60 px-2.5 py-2 border border-base-content/5">
            <div className="text-[10px] uppercase tracking-wider opacity-60">Realized</div>
            <div
              className={`text-xs font-semibold tabular-nums mt-0.5 ${
                realizedNet < 0 ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {formatSigned(realizedNet)}
            </div>
          </div>

          <div className="rounded-box bg-base-100/60 px-2.5 py-2 border border-base-content/5">
            <div className="text-[10px] uppercase tracking-wider opacity-60">Planned</div>
            <div
              className={`text-xs font-semibold tabular-nums mt-0.5 ${
                plannedNet < 0 ? 'text-rose-300' : 'text-indigo-400'
              }`}
            >
              {formatSigned(plannedNet)}
            </div>
          </div>

          <div className="rounded-box bg-base-100/60 px-2.5 py-2 border border-base-content/5">
            <div className="text-[10px] uppercase tracking-wider opacity-60">Net Total</div>
            <div className="text-xs font-semibold tabular-nums mt-0.5">
              {formatSigned(totalNet)}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-[1.5] p-4 h-56 min-w-[300px]">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}