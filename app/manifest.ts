import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DIRA - Classroom Observation System",
    short_name: "DIRA",
    description: "Teacher-focused classroom observation and learning pathway system",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2563eb",
    icons: [
      {
        src: "/images/logo.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/images/logo.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
