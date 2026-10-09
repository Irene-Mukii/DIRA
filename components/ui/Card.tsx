import * as React from "react";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export default function Card({ className = "", children, ...props }: CardProps) {
  return (
    <div className={`rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 ${className}`} {...props}>
      {children}
    </div>
  );
}
