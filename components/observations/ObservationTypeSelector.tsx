import React from "react";

interface ObservationTypeSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

const types = [
  { value: "participation", label: "Participation" },
  { value: "academic", label: "Academic" },
  { value: "behavioral", label: "Behavioral" },
  { value: "attendance", label: "Attendance" },
  { value: "extracurricular", label: "Extracurricular" },
  { value: "test_result", label: "Test Result" },
  { value: "other", label: "Other" },
];

export default function ObservationTypeSelector({ value, onChange }: ObservationTypeSelectorProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
    >
      {types.map((type) => (
        <option key={type.value} value={type.value}>
          {type.label}
        </option>
      ))}
    </select>
  );
}
