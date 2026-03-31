"use client";

import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import type { EmitterPoint } from "@/store/usePressInteractionStore";
import { SMOKE_VOLUME_FRAG, SMOKE_VOLUME_VERT } from "@/features/smoke/webgl/smokeVolumeShaders";

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn("[WebGLSmoke]", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function createProgram(
  gl: WebGL2RenderingContext,
  vs: string,
  fs: string
): WebGLProgram | null {
  const v = compileShader(gl, gl.VERTEX_SHADER, vs);
  const f = compileShader(gl, gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const p = gl.createProgram();
  if (!p) return null;
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.warn("[WebGLSmoke]", gl.getProgramInfoLog(p));
    gl.deleteProgram(p);
    return null;
  }
  return p;
}

type Props = {
  lowPower: boolean;
  pressing: boolean;
  intensity: number;
  emitter: EmitterPoint | null;
  smokeMode: "normal" | "donut" | "dragon";
};

export function useWebGLSmokeVolume(canvasRef: RefObject<HTMLCanvasElement | null>, props: Props) {
  const emitterRef = useRef(props.emitter);
  const pressingRef = useRef(props.pressing);
  const intensityRef = useRef(props.intensity);
  const lowPowerRef = useRef(props.lowPower);
  const smokeModeRef = useRef(props.smokeMode);

  // RAF가 같은 프레임의 props보다 먼저 도는 경우를 줄이기 위해 effect가 아닌 렌더에서 동기화
  emitterRef.current = props.emitter;
  pressingRef.current = props.pressing;
  intensityRef.current = props.intensity;
  lowPowerRef.current = props.lowPower;
  smokeModeRef.current = props.smokeMode;

  const pressDurationSecRef = useRef(0);
  const lastStepAtMsRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastResizeAtRef = useRef(0);
  const prevPressingRef = useRef(false);
  const smokeOpacityRef = useRef(0);
  const holdFrozenRef = useRef(0);
  const intensityFrozenRef = useRef(0);
  /** 릴리즈 직후 props.intensity가 0으로 먼저 동기화되는 경우를 피하기 위해, 누르는 동안 마지막 값을 유지 */
  const lastIntensityWhilePressingRef = useRef(0);
  /** 배경 연무 누적량: 클릭을 다시 해도 이전 연기층이 유지되도록 사용 */
  const carryRef = useRef(0);
  const lastNozzleRef = useRef({ x: 0.5, y: 0.28 });
  const lastTapPointRef = useRef({ x: 0.5, y: 0.28 });
  const prevDonutPressRef = useRef(false);
  const ringInsertRef = useRef(0);
  const ringBurstQueueRef = useRef<
    Array<{
      spawnAtSec: number;
      centerX: number;
      centerY: number;
      radius: number;
      thickness: number;
      speed: number;
      expansion: number;
      dirX: number;
      dirY: number;
      dissipation: number;
      seed: number;
    }>
  >([]);
  const ringDataRef = useRef(
    Array.from({ length: 6 }, () => ({
      centerX: 0.5,
      centerY: 0.45,
      spawnSec: -1000,
      seed: 0,
      radius: 0.08,
      thickness: 0.028,
      speed: 0.42,
      expansion: 0.24,
      dirX: 0,
      dirY: -1,
      dissipation: 1,
      active: 0,
    }))
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      powerPreference: "high-performance",
    }) as WebGL2RenderingContext | null;

    if (!gl) {
      console.warn("[WebGLSmoke] WebGL2 unavailable — ambient smoke disabled");
      return;
    }

    const program = createProgram(gl, SMOKE_VOLUME_VERT, SMOKE_VOLUME_FRAG);
    if (!program) return;

    const aPosition = gl.getAttribLocation(program, "a_position");
    const uResolution = gl.getUniformLocation(program, "u_resolution");
    const uTime = gl.getUniformLocation(program, "u_time");
    const uIntensity = gl.getUniformLocation(program, "u_intensity");
    const uPressDuration = gl.getUniformLocation(program, "u_press_duration");
    const uNozzle = gl.getUniformLocation(program, "u_nozzle");
    const uAspect = gl.getUniformLocation(program, "u_aspect");
    const uLowPower = gl.getUniformLocation(program, "u_low_power");
    const uVisibility = gl.getUniformLocation(program, "u_visibility");
    const uCarry = gl.getUniformLocation(program, "u_carry");
    const uRingData0 = gl.getUniformLocation(program, "u_ring_data0");
    const uRingData1 = gl.getUniformLocation(program, "u_ring_data1");
    const uRingData2 = gl.getUniformLocation(program, "u_ring_data2");

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    gl.useProgram(program);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    let mounted = true;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const rw = rect.width || canvas.clientWidth || 1;
      const rh = rect.height || canvas.clientHeight || 1;
      const dprRaw = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      const dprCap = lowPowerRef.current ? 1.0 : 1.22;
      const dpr = Math.max(1, Math.min(dprCap, dprRaw));
      const scale = lowPowerRef.current ? 0.5 : 0.62;
      const w = Math.max(1, Math.floor(rw * dpr * scale));
      const h = Math.max(1, Math.floor(rh * dpr * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    const step = (now: number) => {
      if (!mounted) return;

      const dtMs =
        lastStepAtMsRef.current > 0 ? Math.min(120, Math.max(0, now - lastStepAtMsRef.current)) : 0;
      lastStepAtMsRef.current = now;
      const dt = dtMs / 1000;
      const pressing = pressingRef.current;
      const donutActive = pressing && smokeModeRef.current === "donut";

      const rect = canvas.getBoundingClientRect();
      const rw = rect.width || canvas.clientWidth || 1;
      const rh = rect.height || canvas.clientHeight || 1;
      const em = emitterRef.current;

      if (em && rw > 0 && rh > 0) {
        lastNozzleRef.current = {
          x: (em.clientX - rect.left) / rw,
          y: (em.clientY - rect.top) / rh,
        };
        lastTapPointRef.current = {
          x: ((em.rawClientX ?? em.clientX) - rect.left) / rw,
          // DOM(clientY) 축과 shader UV 축을 맞추기 위한 보정
          y: 1 - ((em.rawClientY ?? em.clientY) - rect.top) / rh,
        };
      }

      if (pressing) {
        lastIntensityWhilePressingRef.current = intensityRef.current;
      }

      if (prevPressingRef.current && !pressing) {
        holdFrozenRef.current = pressDurationSecRef.current;
        intensityFrozenRef.current = lastIntensityWhilePressingRef.current;
      }
      if (!prevPressingRef.current && pressing) {
        pressDurationSecRef.current = 0;
        // 첫 프레임 dt=0이면 smokeOpacity가 0으로 남아 드로우가 스킵되는 경우 방지
        smokeOpacityRef.current = Math.max(smokeOpacityRef.current, 0.08);
      }

      if (pressing) {
        pressDurationSecRef.current += dt;
        // 클릭 시 화면 밝기 점프를 줄이기 위해 상승 속도를 완만하게
        smokeOpacityRef.current = Math.min(1, smokeOpacityRef.current + dt * 3.55);
        carryRef.current = Math.min(1.72, carryRef.current + dt * 0.4);
      } else {
        smokeOpacityRef.current = Math.max(0, smokeOpacityRef.current - dt * 1.05);
        if (smokeOpacityRef.current > 0.002) {
          intensityFrozenRef.current = Math.max(0, intensityFrozenRef.current - dt * 0.88);
        }
        carryRef.current = Math.max(0, carryRef.current - dt * 0.36);
      }

      const spawnRingNow = (ring: {
        centerX: number;
        centerY: number;
        radius: number;
        thickness: number;
        speed: number;
        expansion: number;
        dirX: number;
        dirY: number;
        dissipation: number;
        seed: number;
      }) => {
        const idx = ringInsertRef.current % ringDataRef.current.length;
        ringInsertRef.current = idx + 1;
        ringDataRef.current[idx] = {
          centerX: ring.centerX,
          centerY: ring.centerY,
          spawnSec: now / 1000,
          seed: ring.seed,
          radius: ring.radius,
          thickness: ring.thickness,
          speed: ring.speed,
          expansion: ring.expansion,
          dirX: ring.dirX,
          dirY: ring.dirY,
          dissipation: ring.dissipation,
          active: 1,
        };
      };

      if (donutActive && !prevDonutPressRef.current) {
        // 더블클릭 1회당 링 1개만 생성
        const burstCount = 1;
        let accDelaySec = 0;
        const driftX = em ? Math.max(-1, Math.min(1, em.driftX)) : 0;
        for (let i = 0; i < burstCount; i++) {
          if (i > 0) accDelaySec += 0.15 + Math.random() * 0.2;
          // 화면 상단(+Y) 방향으로만 진행, 좌우는 랜덤 편차
          const angDeg = 90 + (-28 + Math.random() * 56);
          const ang = (angDeg * Math.PI) / 180;
          const dirX = Math.cos(ang) * (0.7 + Math.random() * 0.5) + driftX * 0.22;
          const dirY = Math.sin(ang);
          ringBurstQueueRef.current.push({
            spawnAtSec: now / 1000 + accDelaySec,
            centerX: lastTapPointRef.current.x,
            centerY: lastTapPointRef.current.y,
            radius: 0.045 + Math.random() * 0.022,
            thickness: 0.02 + Math.random() * 0.015,
            speed: 0.28 + Math.random() * 0.22,
            expansion: 0.16 + Math.random() * 0.12,
            dissipation: 0.86 + Math.random() * 0.28,
            seed: ((i + 1) * 31.27 + now * 0.0019 + Math.random() * 100) % 1000,
            dirX,
            dirY,
          });
        }
      }
      prevDonutPressRef.current = donutActive;

      // 큐에서 발사 시각이 된 링 이벤트를 실제 GPU ring buffer로 밀어넣는다.
      if (ringBurstQueueRef.current.length > 0) {
        const nowSec = now / 1000;
        const remain: typeof ringBurstQueueRef.current = [];
        for (const item of ringBurstQueueRef.current) {
          if (item.spawnAtSec <= nowSec) spawnRingNow(item);
          else remain.push(item);
        }
        ringBurstQueueRef.current = remain.slice(0, 24);
      }

      prevPressingRef.current = pressing;

      if (!pressing && smokeOpacityRef.current <= 0.001) {
        pressDurationSecRef.current = 0;
      }

      if (now - lastResizeAtRef.current > 180) {
        resize();
        lastResizeAtRef.current = now;
      }

      const cw = canvas.width;
      const ch = canvas.height;

      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      // carry가 남아있는 동안에도 그려서 재클릭 시 검은 프레임 깜빡임을 막고,
      // 클릭 중 과도한 밝기 점프를 줄이기 위해 visibility를 완만하게 제한한다.
      const visibility = Math.max(
        carryRef.current * 0.38,
        smokeOpacityRef.current * (0.5 + carryRef.current * 0.08)
      );
      const shouldDraw = visibility > 0.002;
      if (!shouldDraw) {
        rafRef.current = requestAnimationFrame(step);
        return;
      }

      const nozzleX = lastNozzleRef.current.x;
      const nozzleY = lastNozzleRef.current.y;
      const pressDurShader = pressing ? pressDurationSecRef.current : holdFrozenRef.current;
      const intensityShader = pressing ? intensityRef.current : intensityFrozenRef.current;

      const t = now / 1000;
      gl.uniform2f(uResolution, cw, ch);
      gl.uniform1f(uTime, t);
      gl.uniform1f(uIntensity, intensityShader);
      gl.uniform1f(uPressDuration, pressDurShader);
      gl.uniform2f(uNozzle, nozzleX, nozzleY);
      gl.uniform1f(uAspect, cw / Math.max(1, ch));
      gl.uniform1f(uLowPower, lowPowerRef.current ? 1.0 : 0.0);
      gl.uniform1f(uVisibility, visibility);
      gl.uniform1f(uCarry, carryRef.current);
      if (uRingData0 && uRingData1 && uRingData2) {
        const data0 = new Float32Array(6 * 4);
        const data1 = new Float32Array(6 * 4);
        const data2 = new Float32Array(6 * 4);
        for (let i = 0; i < 6; i++) {
          const r = ringDataRef.current[i];
          const b = i * 4;
          data0[b + 0] = r.centerX;
          data0[b + 1] = r.centerY;
          data0[b + 2] = r.spawnSec;
          data0[b + 3] = r.seed;
          data1[b + 0] = r.radius;
          data1[b + 1] = r.thickness;
          data1[b + 2] = r.speed;
          data1[b + 3] = r.expansion;
          data2[b + 0] = r.dirX;
          data2[b + 1] = r.dirY;
          data2[b + 2] = r.dissipation;
          data2[b + 3] = r.active;
        }
        gl.uniform4fv(uRingData0, data0);
        gl.uniform4fv(uRingData1, data1);
        gl.uniform4fv(uRingData2, data2);
      }

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      rafRef.current = requestAnimationFrame(step);
    };

    resize();
    lastResizeAtRef.current = performance.now();
    window.addEventListener("resize", resize);
    rafRef.current = requestAnimationFrame(step);

    return () => {
      mounted = false;
      window.removeEventListener("resize", resize);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      gl.deleteProgram(program);
      gl.deleteBuffer(quad);
    };
  }, [canvasRef]);
}
