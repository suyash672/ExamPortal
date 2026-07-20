"use client";

import React, { useMemo, useState } from "react";
import type { ScoreCardSection } from "@/lib/api/results";

interface AttemptScoreCardProps {
  scorecard: ScoreCardSection[] | undefined;
  studentName: string;
  studentEmail: string;
  testTitle: string;
  score: number | null;
  totalMarks: number;
  startedAt: string;
  submittedAt: string | null;
}

export const AttemptScoreCard: React.FC<AttemptScoreCardProps> = ({
  scorecard = [],
  studentName,
  studentEmail,
  testTitle,
  score,
  totalMarks,
  startedAt,
  submittedAt
}) => {
  const [hoveredAxis, setHoveredAxis] = useState<{
    name: string;
    studentVal: number;
    classVal: number;
    histVal: number;
    x: number;
    y: number;
  } | null>(null);

  // Group stats by module for high-level overview
  const moduleSummaries = useMemo(() => {
    const map = new Map<string, {
      studentSum: number;
      maxSum: number;
      classSumPct: number;
      classCount: number;
      histSumPct: number;
      histCount: number;
      sections: ScoreCardSection[];
    }>();

    scorecard.forEach((sec) => {
      const existing = map.get(sec.moduleName) || {
        studentSum: 0,
        maxSum: 0,
        classSumPct: 0,
        classCount: 0,
        histSumPct: 0,
        histCount: 0,
        sections: []
      };

      existing.studentSum += sec.studentScore;
      existing.maxSum += sec.maxMarks;
      if (sec.classAvg !== null) {
        existing.classSumPct += sec.classAvg;
        existing.classCount += 1;
      }
      if (sec.historicalAvg !== null) {
        existing.histSumPct += sec.historicalAvg;
        existing.histCount += 1;
      }
      existing.sections.push(sec);
      map.set(sec.moduleName, existing);
    });

    const summaries: Array<{
      name: string;
      studentPercent: number;
      classPercent: number;
      histPercent: number;
      sections: ScoreCardSection[];
    }> = [];

    map.forEach((val, key) => {
      summaries.push({
        name: key,
        studentPercent: val.maxSum > 0 ? Math.round((val.studentSum / val.maxSum) * 100) : 0,
        classPercent: val.classCount > 0 ? Math.round(val.classSumPct / val.classCount) : 0,
        histPercent: val.histCount > 0 ? Math.round(val.histSumPct / val.histCount) : 0,
        sections: val.sections
      });
    });

    return summaries;
  }, [scorecard]);

  // SVG Radar configuration
  const radarSize = 320;
  const radarCenter = radarSize / 2;
  const radarRadius = 110;

  const radarPoints = useMemo(() => {
    const N = moduleSummaries.length;
    if (N < 3) return null; // Radar chart requires at least 3 axes to form a polygon

    const angles = Array.from({ length: N }).map((_, i) => (2 * Math.PI * i) / N);

    const getCoords = (valPercent: number, angle: number) => {
      const r = (valPercent / 100) * radarRadius;
      const x = radarCenter + r * Math.sin(angle);
      const y = radarCenter - r * Math.cos(angle);
      return { x, y };
    };

    const studentCoords = moduleSummaries.map((m, idx) => getCoords(m.studentPercent, angles[idx]));
    const classCoords = moduleSummaries.map((m, idx) => getCoords(m.classPercent, angles[idx]));
    const histCoords = moduleSummaries.map((m, idx) => getCoords(m.histPercent, angles[idx]));

    const axisCoords = moduleSummaries.map((m, idx) => {
      const outerX = radarCenter + radarRadius * Math.sin(angles[idx]);
      const outerY = radarCenter - radarRadius * Math.cos(angles[idx]);
      return {
        name: m.name,
        studentPercent: m.studentPercent,
        classPercent: m.classPercent,
        histPercent: m.histPercent,
        inner: { x: radarCenter, y: radarCenter },
        outer: { x: outerX, y: outerY },
        labelPos: {
          x: radarCenter + (radarRadius + 22) * Math.sin(angles[idx]),
          y: radarCenter - (radarRadius + 15) * Math.cos(angles[idx])
        }
      };
    });

    return {
      studentPolygon: studentCoords.map((c) => `${c.x},${c.y}`).join(" "),
      classPolygon: classCoords.map((c) => `${c.x},${c.y}`).join(" "),
      histPolygon: histCoords.map((c) => `${c.x},${c.y}`).join(" "),
      axes: axisCoords
    };
  }, [moduleSummaries, radarCenter, radarRadius]);

  const handlePrint = () => {
    window.print();
  };

  const scorePct = totalMarks > 0 ? Math.round(((score ?? 0) / totalMarks) * 100) : 0;
  const isPass = scorePct >= 50;

  return (
    <div className="space-y-8 score-card-container">
      {/* Action Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-4 no-print">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Attempt Score Card</h2>
          <p className="text-sm text-slate-500">Overview of candidates analytics and topic breakdown.</p>
        </div>
        <button
          type="button"
          onClick={handlePrint}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          🖨️ Print / Save PDF
        </button>
      </div>

      {/* Profile Header */}
      <div className="grid gap-4 rounded-2xl border border-slate-100 bg-slate-50/50 p-6 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Candidate Name</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{studentName}</p>
          <p className="text-xs text-slate-500">{studentEmail}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Exam Title</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{testTitle}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Date Attempted</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {new Date(startedAt).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit"
            })}
          </p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Duration Taken</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {submittedAt
              ? `${Math.round((new Date(submittedAt).getTime() - new Date(startedAt).getTime()) / 60000)} minutes`
              : "Ongoing"}
          </p>
        </div>
      </div>

      {/* Main Analytics Panel */}
      <div className="grid gap-8 lg:grid-cols-12">
        {/* Total rings and overall metrics */}
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-100 bg-white p-6 shadow-sm lg:col-span-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Result Summary</h3>
          
          <div className="relative mt-6 flex items-center justify-center">
            {/* Circular Progress Ring */}
            <svg className="h-36 w-36 -rotate-90">
              <circle
                cx="72"
                cy="72"
                r="64"
                className="stroke-slate-100 fill-none"
                strokeWidth="12"
              />
              <circle
                cx="72"
                cy="72"
                r="64"
                className={`fill-none transition-all duration-1000 ${
                  isPass ? "stroke-teal-500" : "stroke-rose-500"
                }`}
                strokeWidth="12"
                strokeDasharray={2 * Math.PI * 64}
                strokeDashoffset={2 * Math.PI * 64 * (1 - scorePct / 100)}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center text-center">
              <span className="text-3xl font-extrabold text-slate-900">{scorePct}%</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Score pct</span>
            </div>
          </div>

          <div className="mt-6 text-center space-y-1">
            <p className="text-2xl font-bold text-slate-900">{score ?? 0} / {totalMarks} Marks</p>
            <span
              className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${
                isPass
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-rose-50 text-rose-800 border border-rose-200"
              }`}
            >
              {isPass ? "STATUS: PASSED" : "STATUS: FAILED"}
            </span>
          </div>
        </div>

        {/* Radar Competency Chart */}
        <div className="relative flex flex-col items-center justify-center rounded-2xl border border-slate-100 bg-white p-6 shadow-sm lg:col-span-8">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Competency Distribution Map</h3>
          <p className="text-[11px] text-slate-500 mt-1">Comparison of overall percentage proficiency across subject modules.</p>

          <div className="mt-4 flex items-center justify-center">
            {moduleSummaries.length < 3 ? (
              <div className="flex flex-col w-full min-w-[280px] sm:min-w-[360px] gap-6 py-6 px-2 justify-center">
                {moduleSummaries.map((m, idx) => (
                  <div key={idx} className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                      <span className="uppercase tracking-wider">{m.name} Module</span>
                      <span className="text-teal-600 font-bold">You: {m.studentPercent}% vs Class: {m.classPercent}%</span>
                    </div>
                    {/* Comparative bars */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] w-12 text-slate-400 uppercase font-bold">You</span>
                        <div className="h-3.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full bg-teal-500 rounded-full transition-all duration-500" style={{ width: `${m.studentPercent}%` }} />
                        </div>
                        <span className="text-[10px] font-bold text-slate-600 w-8 text-right">{m.studentPercent}%</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] w-12 text-slate-400 uppercase font-bold">Class</span>
                        <div className="h-3.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full bg-slate-400 rounded-full transition-all duration-500" style={{ width: `${m.classPercent}%` }} />
                        </div>
                        <span className="text-[10px] font-bold text-slate-600 w-8 text-right">{m.classPercent}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <svg width={radarSize} height={radarSize} className="overflow-visible">
                {/* Background Concentric Circles */}
                {[20, 40, 60, 80, 100].map((step) => (
                  <circle
                    key={step}
                    cx={radarCenter}
                    cy={radarCenter}
                    r={(step / 100) * radarRadius}
                    className="stroke-slate-100 fill-none"
                    strokeWidth="1"
                    strokeDasharray="2,2"
                  />
                ))}

                {/* Grid Axes Lines */}
                {radarPoints?.axes.map((axis, idx) => (
                  <line
                    key={idx}
                    x1={axis.inner.x}
                    y1={axis.inner.y}
                    x2={axis.outer.x}
                    y2={axis.outer.y}
                    className="stroke-slate-200"
                    strokeWidth="1"
                  />
                ))}

                {/* Shaded Area: Class Average */}
                {radarPoints?.classPolygon && (
                  <polygon
                    points={radarPoints.classPolygon}
                    className="fill-slate-400/10 stroke-slate-400"
                    strokeWidth="1.5"
                    strokeDasharray="3,3"
                  />
                )}

                {/* Shaded Area: Student Current Attempt */}
                {radarPoints?.studentPolygon && (
                  <polygon
                    points={radarPoints.studentPolygon}
                    className="fill-teal-500/20 stroke-teal-500"
                    strokeWidth="2.5"
                  />
                )}

                {/* Interaction vertices points & Labels */}
                {radarPoints?.axes.map((axis, idx) => (
                  <g key={idx} className="cursor-pointer">
                    <circle
                      cx={radarCenter + (axis.studentPercent / 100) * radarRadius * Math.sin((2 * Math.PI * idx) / moduleSummaries.length)}
                      cy={radarCenter - (axis.studentPercent / 100) * radarRadius * Math.cos((2 * Math.PI * idx) / moduleSummaries.length)}
                      r="5"
                      className="fill-teal-500 stroke-white"
                      strokeWidth="1.5"
                      onMouseEnter={(e) => {
                        const targetCircle = e.currentTarget;
                        const rect = targetCircle.getBoundingClientRect();
                        setHoveredAxis({
                          name: axis.name,
                          studentVal: axis.studentPercent,
                          classVal: axis.classPercent,
                          histVal: axis.histPercent,
                          x: axis.outer.x,
                          y: axis.outer.y
                        });
                      }}
                      onMouseLeave={() => setHoveredAxis(null)}
                    />
                    <text
                      x={axis.labelPos.x}
                      y={axis.labelPos.y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="text-[10px] font-bold fill-slate-600 uppercase"
                    >
                      {axis.name.substring(0, 10)}
                    </text>
                  </g>
                ))}

                {/* Active hover tooltip inside SVG */}
                {hoveredAxis && (
                  <g>
                    <rect
                      x={hoveredAxis.x - 65}
                      y={hoveredAxis.y - 65}
                      width="130"
                      height="52"
                      rx="8"
                      className="fill-slate-900/90 text-white"
                    />
                    <text x={hoveredAxis.x} y={hoveredAxis.y - 50} textAnchor="middle" className="text-[10px] font-bold fill-white">
                      {hoveredAxis.name}
                    </text>
                    <text x={hoveredAxis.x} y={hoveredAxis.y - 36} textAnchor="middle" className="text-[9px] fill-teal-300">
                      Your Score: {hoveredAxis.studentVal}%
                    </text>
                    <text x={hoveredAxis.x} y={hoveredAxis.y - 24} textAnchor="middle" className="text-[9px] fill-slate-300">
                      Class Avg: {hoveredAxis.classVal}%
                    </text>
                  </g>
                )}
              </svg>
            )}
          </div>

          {/* Legend */}
          <div className="mt-4 flex items-center justify-center gap-6 text-xs font-semibold text-slate-600">
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-teal-500" />
              <span>Student Score</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full border border-dashed border-slate-400 bg-slate-100" />
              <span>Class Avg</span>
            </div>
          </div>
        </div>
      </div>

      {/* Module breakdown statistics */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Module Performance Breakdown</h3>
          <p className="text-sm text-slate-500">Detailed comparison of difficulty types (Easy, Medium, Hard) per module.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {moduleSummaries.map((summary) => (
            <div key={summary.name} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                <h4 className="font-bold text-slate-800">{summary.name} Module</h4>
                <span className="text-xs font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-md">
                  Overall: {summary.studentPercent}%
                </span>
              </div>

              <div className="space-y-4">
                {summary.sections.map((sec, sIdx) => {
                  const percent = sec.maxMarks > 0 ? Math.round((sec.studentScore / sec.maxMarks) * 100) : 0;
                  const difficultyColor = 
                    sec.type === "easy" ? "text-emerald-600 bg-emerald-50" :
                    sec.type === "medium" ? "text-amber-600 bg-amber-50" :
                    "text-rose-600 bg-rose-50";

                  return (
                    <div key={sIdx} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded font-bold uppercase text-[9px] ${difficultyColor}`}>
                            {sec.type}
                          </span>
                          <span className="font-bold text-slate-700">
                            Score: {sec.studentScore} / {sec.maxMarks}
                          </span>
                        </div>
                        <span className="font-semibold text-slate-500">
                          {percent}%
                        </span>
                      </div>

                      {/* Score distribution bar */}
                      <div className="relative h-4 w-full rounded-full bg-slate-100 overflow-visible">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            percent >= 70 ? "bg-emerald-500" : percent >= 50 ? "bg-amber-500" : "bg-rose-500"
                          }`}
                          style={{ width: `${percent}%` }}
                        />

                        {/* Class Average Indicator Marker */}
                        {sec.classAvg !== null && (
                          <div
                            className="absolute top-0 -mt-1 bottom-0 w-0.5 bg-slate-900 group"
                            style={{ left: `${sec.classAvg}%` }}
                            title={`Class Average: ${sec.classAvg}%`}
                          >
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-slate-900 text-white text-[9px] px-1.5 py-0.5 rounded shadow">
                              Class Avg: {sec.classAvg}%
                            </div>
                            <span className="absolute -top-1 -left-1.5 text-[8px]">▼</span>
                          </div>
                        )}

                        {/* Student Lifetime Historical Average Indicator Marker */}
                        {sec.historicalAvg !== null && (
                          <div
                            className="absolute top-0 -mt-1 bottom-0 w-0.5 bg-teal-600 group"
                            style={{ left: `${sec.historicalAvg}%` }}
                            title={`Your Lifetime Avg: ${sec.historicalAvg}%`}
                          >
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-teal-600 text-white text-[9px] px-1.5 py-0.5 rounded shadow">
                              Your Avg: {sec.historicalAvg}%
                            </div>
                            <span className="absolute -bottom-2 -left-1.5 text-[8px] text-teal-600">▲</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Global CSS for Print Optimization */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .score-card-container, .score-card-container * {
            visibility: visible;
          }
          .score-card-container {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 0;
            margin: 0;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
};
