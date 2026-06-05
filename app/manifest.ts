import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "F1 Task Manager",
    short_name: "F1 Tasks",
    description: "Tasks do dia — modo pit stop",
    start_url: "/mobile",
    scope: "/mobile",
    display: "standalone",
    orientation: "portrait",
    background_color: "#09090b",
    theme_color: "#09090b",
    icons: [
      {
        src: "/favicon.png",
        sizes: "any",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/favicon.png",
        sizes: "any",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
