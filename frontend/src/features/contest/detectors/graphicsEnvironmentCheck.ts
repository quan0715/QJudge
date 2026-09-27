export interface GraphicsEnvironmentCheck {
  renderer: string | null;
  failure: "webglUnavailable" | "softwareRenderer" | null;
}

/** Admission policy signals; these do not prove that a session is remote. */
export const checkGraphicsEnvironment = (): GraphicsEnvironmentCheck => {
  const canvas = document.createElement("canvas");
  let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  for (const type of ["webgl2", "webgl"] as const) {
    try {
      gl = type === "webgl2" ? canvas.getContext("webgl2") : canvas.getContext("webgl");
    } catch {
      // Try the other version before declaring WebGL unavailable.
    }
    if (gl) break;
  }
  if (!gl) return { renderer: null, failure: "webglUnavailable" };

  try {
    if (gl.isContextLost()) return { renderer: null, failure: "webglUnavailable" };
    let renderer: string | null = null;
    try {
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      const value: unknown = gl.getParameter(info?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER);
      if (typeof value === "string") renderer = value;
    } catch {
      // GPU metadata may be hidden even when WebGL itself is available.
    }
    return {
      renderer,
      failure: renderer && /\bllvmpipe\b/i.test(renderer) ? "softwareRenderer" : null,
    };
  } finally {
    // Preflight is repeated before admission; do not accumulate GPU contexts.
    try {
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      // Context cleanup must not change the observed admission result.
    }
  }
};
