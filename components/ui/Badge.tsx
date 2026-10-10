import * as React from "react";

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline-solid";
}

const variants = {
  default: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  secondary: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
  destructive: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  "outline-solid": "text-gray-600 border border-gray-300 dark:text-gray-300 dark:border-gray-700",
};

export default function Badge({ className = "", variant = "default", children, ...props }: BadgeProps) {
  const classes = `${variants[variant]} inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`;
  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
}
