import { clamp } from "./techno-model.js";

const TAU = Math.PI * 2;
const TERRAIN_WIDTH = 3.8;
const TERRAIN_DEPTH = 5.5;

export const SPECTRAL_BANDS = Object.freeze([
  Object.freeze({ id: "sub", low: 20, high: 120 }),
  Object.freeze({ id: "bass", low: 120, high: 360 }),
  Object.freeze({ id: "body", low: 360, high: 1600 }),
  Object.freeze({ id: "presence", low: 1600, high: 6000 }),
  Object.freeze({ id: "air", low: 6000, high: 16000 }),
]);

function clamp01(value) {
  return clamp(Number(value) || 0, 0, 1);
}

function hashSeed(seed) {
  let hash = 2166136261;
  for (const character of String(seed)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function normalize3(vector) {
  const length = Math.max(1e-8, Math.hypot(...vector));
  return vector.map((value) => value / length);
}

function cross3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function subtract3(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function extractSpectralBands(spectrum, sampleRate = 48000) {
  if (!spectrum?.length) return Object.freeze(Array(SPECTRAL_BANDS.length).fill(0));
  const nyquist = Math.max(1, Number(sampleRate) || 48000) * 0.5;
  const binWidth = nyquist / spectrum.length;
  return Object.freeze(SPECTRAL_BANDS.map(({ low, high }) => {
    const first = clamp(Math.ceil(low / binWidth), 0, spectrum.length - 1);
    const last = clamp(
      Math.floor(Math.min(high, nyquist) / binWidth),
      first,
      spectrum.length - 1,
    );
    let power = 0;
    let count = 0;
    for (let index = first; index <= last; index += 1) {
      const amplitude = Math.max(0, ((Number(spectrum[index]) || 0) / 255 - 0.06) / 0.94);
      power += amplitude * amplitude;
      count += 1;
    }
    return count ? clamp01(Math.sqrt(power / count)) : 0;
  }));
}

export function resampleLogSpectrum(spectrum, sampleRate = 48000, columns = 128) {
  const count = clamp(Math.floor(Number(columns) || 128), 32, 192);
  if (!spectrum?.length) return Object.freeze(Array(count).fill(0));
  const nyquist = Math.max(1, Number(sampleRate) || 48000) * 0.5;
  const low = 25;
  const high = Math.min(16000, nyquist);
  const binWidth = nyquist / spectrum.length;
  const raw = Array.from({ length: count }, (_, column) => {
    const amount = column / Math.max(1, count - 1);
    const frequency = low * ((high / low) ** amount);
    const center = clamp(Math.round(frequency / binWidth), 0, spectrum.length - 1);
    const radius = Math.max(1, Math.floor(center * 0.032));
    let maximum = 0;
    let sum = 0;
    let samples = 0;
    for (
      let index = Math.max(0, center - radius);
      index <= Math.min(spectrum.length - 1, center + radius);
      index += 1
    ) {
      const amplitude = Math.max(0, ((Number(spectrum[index]) || 0) / 255 - 0.05) / 0.95);
      maximum = Math.max(maximum, amplitude);
      sum += amplitude;
      samples += 1;
    }
    return clamp01(Math.pow(maximum * 0.64 + (samples ? sum / samples : 0) * 0.36, 0.86));
  });
  return Object.freeze(raw.map((value, index) => {
    const previous = raw[Math.max(0, index - 1)];
    const next = raw[Math.min(raw.length - 1, index + 1)];
    return clamp01(value * 0.62 + previous * 0.19 + next * 0.19);
  }));
}

export function buildTerrainGrid(xSegments = 128, zSegments = 64) {
  const columns = clamp(Math.floor(Number(xSegments) || 128), 16, 192);
  const rows = clamp(Math.floor(Number(zSegments) || 64), 12, 96);
  const vertices = new Float32Array((columns + 1) * (rows + 1) * 2);
  let vertexOffset = 0;
  for (let row = 0; row <= rows; row += 1) {
    for (let column = 0; column <= columns; column += 1) {
      vertices[vertexOffset] = column / columns;
      vertices[vertexOffset + 1] = row / rows;
      vertexOffset += 2;
    }
  }
  const indices = new Uint16Array(columns * rows * 6);
  let indexOffset = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const topLeft = row * (columns + 1) + column;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + columns + 1;
      const bottomRight = bottomLeft + 1;
      indices.set(
        [topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight],
        indexOffset,
      );
      indexOffset += 6;
    }
  }
  return Object.freeze({ columns, rows, vertices, indices });
}

export function perspectiveMatrix(fovRadians, aspect, near, far) {
  const f = 1 / Math.tan(fovRadians * 0.5);
  const range = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * range, -1,
    0, 0, 2 * far * near * range, 0,
  ]);
}

export function lookAtMatrix(eye, target, up = [0, 1, 0]) {
  const z = normalize3(subtract3(eye, target));
  const x = normalize3(cross3(up, z));
  const y = cross3(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]),
    -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]),
    -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]),
    1,
  ]);
}

export function multiplyMatrices(a, b) {
  const output = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      output[column * 4 + row] =
        a[row] * b[column * 4] +
        a[4 + row] * b[column * 4 + 1] +
        a[8 + row] * b[column * 4 + 2] +
        a[12 + row] * b[column * 4 + 3];
    }
  }
  return output;
}

export class SpectrumTerrainHistory {
  constructor({ columns = 128, rows = 64, seed = "0" } = {}) {
    this.columns = clamp(Math.floor(Number(columns) || 128), 32, 192);
    this.rows = clamp(Math.floor(Number(rows) || 64), 16, 96);
    this.data = new Uint8Array(this.columns * this.rows);
    this.latest = new Float32Array(this.columns);
    this.bands = new Float32Array(SPECTRAL_BANDS.length);
    this.previousBands = new Float32Array(SPECTRAL_BANDS.length);
    this.rowPhase = 0;
    this.flux = 0;
    this.hasAudioTerrain = false;
    this.seed = String(seed);
    this.reset(this.seed);
  }

  reset(seed = this.seed) {
    this.seed = String(seed);
    const phase = hashSeed(this.seed) * TAU;
    for (let row = 0; row < this.rows; row += 1) {
      for (let column = 0; column < this.columns; column += 1) {
        const x = column / Math.max(1, this.columns - 1);
        const z = row / Math.max(1, this.rows - 1);
        const idle =
          0.028 +
          Math.max(0, Math.sin(x * 10.5 + z * 3.2 + phase)) * 0.018 +
          Math.max(0, Math.sin(x * 23 - z * 4.7 + phase * 0.7)) * 0.009;
        this.data[row * this.columns + column] = Math.round(clamp01(idle) * 255);
      }
    }
    this.latest.set(
      this.data.slice((this.rows - 1) * this.columns, this.rows * this.columns),
    );
    for (let index = 0; index < this.latest.length; index += 1) this.latest[index] /= 255;
    this.bands.fill(0);
    this.previousBands.fill(0);
    this.rowPhase = 0;
    this.flux = 0;
    this.hasAudioTerrain = false;
  }

  update(spectrum, sampleRate, delta, { active = true, reducedMotion = false } = {}) {
    const safeDelta = clamp(Number(delta) || 0, 0, 0.12);
    const targetBands = active
      ? extractSpectralBands(spectrum, sampleRate)
      : Array(SPECTRAL_BANDS.length).fill(0);
    const targetRow = active
      ? resampleLogSpectrum(spectrum, sampleRate, this.columns)
      : this.latest;
    const targetPeak = active ? Math.max(...targetRow) : 0;
    if (!this.hasAudioTerrain && targetPeak > 0.08) {
      const seedPhase = hashSeed(this.seed) * TAU;
      for (let row = 0; row < this.rows; row += 1) {
        const drift = Math.round(
          Math.sin(row * 0.24 + seedPhase) * 2.2 +
          Math.sin(row * 0.087 + seedPhase * 1.7) * 1.4,
        );
        const depthVariation =
          0.76 +
          Math.sin(row * 0.31 + seedPhase) * 0.1 +
          Math.sin(row * 0.12 + seedPhase * 0.6) * 0.07;
        for (let column = 0; column < this.columns; column += 1) {
          const source = clamp(column + drift, 0, this.columns - 1);
          const idle = this.data[row * this.columns + column] / 255;
          const warmHeight = targetRow[source] * depthVariation;
          this.data[row * this.columns + column] = Math.round(
            clamp01(idle * 0.12 + warmHeight * 0.88) * 255,
          );
        }
      }
      this.latest.set(targetRow);
      this.hasAudioTerrain = true;
    }
    let fluxPower = 0;
    const bandMix = 1 - Math.exp(-safeDelta * 7.5);
    for (let index = 0; index < this.bands.length; index += 1) {
      const difference = targetBands[index] - this.previousBands[index];
      fluxPower += difference * difference;
      this.bands[index] += (targetBands[index] - this.bands[index]) * bandMix;
      this.previousBands[index] = targetBands[index];
    }
    this.flux += (
      Math.sqrt(fluxPower / this.bands.length) - this.flux
    ) * (1 - Math.exp(-safeDelta * 12));
    const rowMix = active ? 1 - Math.exp(-safeDelta * (10 + this.flux * 18)) : 0;
    for (let index = 0; index < this.columns; index += 1) {
      this.latest[index] += (targetRow[index] - this.latest[index]) * rowMix;
    }
    const flowRowsPerSecond = reducedMotion ? 0.7 : 4.8 + this.bands[2] * 2.2;
    this.rowPhase += safeDelta * flowRowsPerSecond;
    while (this.rowPhase >= 1) {
      this.data.copyWithin(0, this.columns);
      this.rowPhase -= 1;
    }
    const lastOffset = (this.rows - 1) * this.columns;
    for (let index = 0; index < this.columns; index += 1) {
      this.data[lastOffset + index] = Math.round(clamp01(this.latest[index]) * 255);
    }
    const intensity = this.bands.reduce((sum, value) => sum + value, 0) / this.bands.length;
    const total = Math.max(1e-6, this.bands.reduce((sum, value) => sum + value, 0));
    const centroid = this.bands.reduce(
      (sum, value, index) => sum + value * (index / (this.bands.length - 1)),
      0,
    ) / total;
    const balance = clamp(
      (this.bands[3] + this.bands[4] - this.bands[0] - this.bands[1]) * 0.5,
      -1,
      1,
    );
    return Object.freeze({
      bands: Object.freeze([...this.bands]),
      intensity,
      centroid,
      balance,
      flux: this.flux,
      historyOffset: this.rowPhase / this.rows,
    });
  }
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "Unknown shader compile failure";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || "Unknown shader link failure";
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

const TERRAIN_VERTEX_SHADER = `#version 300 es
  precision highp float;
  in vec2 aGrid;
  uniform sampler2D uHeightMap;
  uniform mat4 uViewProjection;
  uniform float uHistoryOffset;
  uniform float uHeightScale;
  uniform float uKick;
  uniform float uBass;
  uniform float uFlightX;
  out vec3 vWorldPosition;
  out vec2 vUv;
  out float vHeight;

  float sampleSpectrum(vec2 uv) {
    vec2 texel = vec2(1.7 / 128.0, 1.25 / 64.0);
    vec2 sampleUv = vec2(clamp(uv.x, 0.0, 1.0), clamp(uv.y + uHistoryOffset, 0.0, 1.0));
    return
      texture(uHeightMap, sampleUv).r * 0.48 +
      texture(uHeightMap, clamp(sampleUv + vec2(texel.x, 0.0), 0.0, 1.0)).r * 0.13 +
      texture(uHeightMap, clamp(sampleUv - vec2(texel.x, 0.0), 0.0, 1.0)).r * 0.13 +
      texture(uHeightMap, clamp(sampleUv + vec2(0.0, texel.y), 0.0, 1.0)).r * 0.13 +
      texture(uHeightMap, clamp(sampleUv - vec2(0.0, texel.y), 0.0, 1.0)).r * 0.13;
  }

  float terrainHeight(vec2 uv) {
    float spectrum = sampleSpectrum(uv);
    float edge = smoothstep(0.0, 0.035, uv.x) * smoothstep(0.0, 0.035, 1.0 - uv.x);
    float depthGain = mix(1.12, 0.82, uv.y);
    float relief = pow(max(0.0, spectrum), 1.14) * uHeightScale * depthGain;
    relief *= 1.0 + uKick * 0.48 + uBass * 0.18;
    return (0.025 + relief) * edge;
  }

  void main() {
    vUv = aGrid;
    vHeight = terrainHeight(aGrid);
    float x = (aGrid.x - 0.5) * ${TERRAIN_WIDTH.toFixed(1)} + (aGrid.y - 0.5) * uFlightX;
    float z = mix(-2.6, 2.9, aGrid.y);
    vWorldPosition = vec3(x, vHeight, z);
    gl_Position = uViewProjection * vec4(vWorldPosition, 1.0);
  }
`;

const TERRAIN_FRAGMENT_SHADER = `#version 300 es
  precision highp float;
  in vec3 vWorldPosition;
  in vec2 vUv;
  in float vHeight;
  uniform sampler2D uHeightMap;
  uniform vec3 uCameraPosition;
  uniform vec3 uLightDirection;
  uniform vec3 uBackground;
  uniform float uHistoryOffset;
  uniform float uHeightScale;
  uniform float uKick;
  uniform float uBass;
  uniform float uHat;
  uniform float uChord;
  uniform float uSynth;
  uniform float uTime;
  uniform float uLightIntensity;
  uniform float uRainbowPhase;
  uniform float uRainbowStrength;
  uniform float uRoughness;
  out vec4 outputColor;

  float sampleSpectrum(vec2 uv) {
    vec2 texel = vec2(1.7 / 128.0, 1.25 / 64.0);
    vec2 sampleUv = vec2(clamp(uv.x, 0.0, 1.0), clamp(uv.y + uHistoryOffset, 0.0, 1.0));
    return
      texture(uHeightMap, sampleUv).r * 0.48 +
      texture(uHeightMap, clamp(sampleUv + vec2(texel.x, 0.0), 0.0, 1.0)).r * 0.13 +
      texture(uHeightMap, clamp(sampleUv - vec2(texel.x, 0.0), 0.0, 1.0)).r * 0.13 +
      texture(uHeightMap, clamp(sampleUv + vec2(0.0, texel.y), 0.0, 1.0)).r * 0.13 +
      texture(uHeightMap, clamp(sampleUv - vec2(0.0, texel.y), 0.0, 1.0)).r * 0.13;
  }

  float terrainHeight(vec2 uv) {
    float spectrum = sampleSpectrum(uv);
    float edge = smoothstep(0.0, 0.035, uv.x) * smoothstep(0.0, 0.035, 1.0 - uv.x);
    float depthGain = mix(1.12, 0.82, uv.y);
    float relief = pow(max(0.0, spectrum), 1.14) * uHeightScale * depthGain;
    relief *= 1.0 + uKick * 0.48 + uBass * 0.18;
    return (0.025 + relief) * edge;
  }

  float terrainShadow(vec3 position) {
    float visibility = 1.0;
    for (int stepIndex = 1; stepIndex <= 10; stepIndex++) {
      float travel = float(stepIndex) * 0.16;
      vec2 offset = vec2(
        uLightDirection.x / ${TERRAIN_WIDTH.toFixed(1)},
        uLightDirection.z / ${TERRAIN_DEPTH.toFixed(1)}
      ) * travel;
      vec2 sampleUv = vUv + offset;
      float inside =
        step(0.0, sampleUv.x) * step(sampleUv.x, 1.0) *
        step(0.0, sampleUv.y) * step(sampleUv.y, 1.0);
      float rayHeight = position.y + uLightDirection.y * travel;
      float blockerHeight = terrainHeight(sampleUv);
      float blocked = smoothstep(rayHeight + 0.018, rayHeight + 0.085, blockerHeight) * inside;
      visibility *= 1.0 - blocked * 0.15;
    }
    return clamp(visibility, 0.28, 1.0);
  }

  void main() {
    vec2 normalStep = vec2(1.6 / 128.0, 1.25 / 64.0);
    float slopeX = (
      terrainHeight(vUv + vec2(normalStep.x, 0.0)) -
      terrainHeight(vUv - vec2(normalStep.x, 0.0))
    ) / (2.0 * normalStep.x * ${TERRAIN_WIDTH.toFixed(1)});
    float slopeZ = (
      terrainHeight(vUv + vec2(0.0, normalStep.y)) -
      terrainHeight(vUv - vec2(0.0, normalStep.y))
    ) / (2.0 * normalStep.y * ${TERRAIN_DEPTH.toFixed(1)});
    vec3 normal = normalize(vec3(-slopeX, 1.0, -slopeZ));
    vec3 viewDirection = normalize(uCameraPosition - vWorldPosition);
    vec3 halfDirection = normalize(uLightDirection + viewDirection);
    float diffuse = max(0.0, dot(normal, uLightDirection));
    float shadow = terrainShadow(vWorldPosition + normal * 0.012);
    float gloss = mix(18.0, 92.0, 1.0 - uRoughness);
    float specular = pow(max(0.0, dot(normal, halfDirection)), gloss);
    float fresnel = pow(1.0 - max(0.0, dot(normal, viewDirection)), 3.0);

    float rainbowCoordinate =
      vWorldPosition.x * (0.22 + uHat * 0.08) +
      vWorldPosition.z * 0.11 +
      vHeight * (0.42 + uBass * 0.18) +
      uRainbowPhase;
    vec3 rainbow = 0.5 + 0.5 * cos(
      6.2831853 * (rainbowCoordinate + vec3(0.0, 0.333333, 0.666667))
    );
    float projector = 0.38 + 0.62 * smoothstep(
      -0.25,
      0.82,
      sin(vWorldPosition.z * (1.35 + uChord * 0.6) - uTime * 0.18 + uSynth)
    );
    float projection = uRainbowStrength * projector * (0.3 + diffuse * 0.7);

    vec3 whiteMaterial = vec3(0.91, 0.925, 0.95);
    vec3 color = whiteMaterial * (0.28 + diffuse * shadow * uLightIntensity * 0.78);
    color += rainbow * projection * shadow;
    color += rainbow * specular * (0.45 + uLightIntensity * 0.5);
    color += mix(vec3(0.16, 0.2, 0.28), rainbow, 0.45) * fresnel * 0.2;
    color += whiteMaterial * uKick * diffuse * 0.12;
    float fog = smoothstep(1.8, 6.2, distance(vWorldPosition, uCameraPosition));
    color = mix(color, uBackground, fog * 0.42);
    outputColor = vec4(max(vec3(0.0), color), 1.0);
  }
`;

export class SpectrumMountainRenderer {
  constructor(canvas, { reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.reducedMotion = reducedMotion;
    this.gl = canvas?.getContext?.("webgl2", {
      alpha: false,
      antialias: true,
      depth: true,
      premultipliedAlpha: false,
      powerPreference: "high-performance",
    }) || null;
    if (!this.gl) throw new Error("WebGL2 unavailable");
    this.context = this.gl;
    this.program = createProgram(this.gl, TERRAIN_VERTEX_SHADER, TERRAIN_FRAGMENT_SHADER);
    this.grid = buildTerrainGrid(128, 64);
    this.history = new SpectrumTerrainHistory({ columns: 128, rows: 64 });
    this.forecastGenes = {
      curl: 0,
      orbit: 0.5,
      cellular: 0.35,
      grain: 0.5,
    };
    this.width = 1;
    this.height = 1;
    this.dpr = 1;
    this.initializeBuffers();
    this.initializeTexture();
    this.locations = this.collectLocations();
  }

  initializeBuffers() {
    const gl = this.gl;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.grid.vertices, gl.STATIC_DRAW);
    const location = gl.getAttribLocation(this.program, "aGrid");
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    this.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.grid.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
  }

  initializeTexture() {
    const gl = this.gl;
    this.heightTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.heightTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R8,
      this.history.columns,
      this.history.rows,
      0,
      gl.RED,
      gl.UNSIGNED_BYTE,
      this.history.data,
    );
  }

  collectLocations() {
    const names = [
      "uHeightMap", "uViewProjection", "uCameraPosition", "uLightDirection",
      "uBackground", "uHistoryOffset", "uHeightScale", "uKick", "uBass",
      "uHat", "uChord", "uSynth", "uFlightX", "uTime", "uLightIntensity",
      "uRainbowPhase", "uRainbowStrength", "uRoughness",
    ];
    return Object.fromEntries(names.map((name) => [name, this.gl.getUniformLocation(this.program, name)]));
  }

  setSeed(seed) {
    this.history.reset(seed);
  }

  setForecast(forecast) {
    if (!forecast?.genes) return;
    this.forecastGenes = {
      curl: clamp(Number(forecast.genes.curl) || 0, -1, 1),
      orbit: clamp01(forecast.genes.orbit),
      cellular: clamp01(forecast.genes.cellular),
      grain: clamp01(forecast.genes.grain),
    };
  }

  resize(width, height, dpr = 1) {
    this.width = Math.max(1, Number(width) || 1);
    this.height = Math.max(1, Number(height) || 1);
    const cap = this.width < 600 ? 1.25 : 1.6;
    this.dpr = clamp(Number(dpr) || 1, 1, cap);
    const pixelWidth = Math.max(1, Math.floor(this.width * this.dpr));
    const pixelHeight = Math.max(1, Math.floor(this.height * this.dpr));
    if (this.canvas.width !== pixelWidth) this.canvas.width = pixelWidth;
    if (this.canvas.height !== pixelHeight) this.canvas.height = pixelHeight;
    this.gl.viewport(0, 0, pixelWidth, pixelHeight);
  }

  render({ now, delta, spectrum, sampleRate, active, pulses = {}, energy = 0.42 }) {
    const gl = this.gl;
    const time = Number(now) / 1000;
    const state = this.history.update(spectrum, sampleRate, delta, {
      active,
      reducedMotion: this.reducedMotion,
    });
    const [sub, bassBand, body, presence, air] = state.bands;
    const kick = clamp01(pulses.kick);
    const bass = clamp01(pulses.bass);
    const hat = clamp01(pulses.hat);
    const chord = clamp01(pulses.chord);
    const synth = clamp01(pulses.synth);
    const drift = this.reducedMotion ? 0 : Math.sin(time * 0.035 + this.forecastGenes.curl) * 0.12;
    const flightX = clamp(state.balance * 0.62 + drift, -0.72, 0.72);
    const eye = [
      flightX * 0.55,
      1.52 + body * 0.34 + kick * 0.06,
      -3.72,
    ];
    const target = [flightX * 0.22, 0.28 + bassBand * 0.16, 0.62];
    const projection = perspectiveMatrix(47 * Math.PI / 180, this.width / this.height, 0.08, 20);
    const view = lookAtMatrix(eye, target);
    const viewProjection = multiplyMatrices(projection, view);
    const azimuth =
      time * (this.reducedMotion ? 0.018 : 0.08 + hat * 0.035) +
      state.centroid * 3.8 +
      this.forecastGenes.orbit * 1.7;
    const lightDirection = normalize3([
      Math.cos(azimuth) * 0.72,
      0.3 + body * 0.3 + kick * 0.08,
      Math.sin(azimuth) * 0.72,
    ]);
    const background = [0.006, 0.009, 0.022];

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.heightTexture);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      this.history.columns,
      this.history.rows,
      gl.RED,
      gl.UNSIGNED_BYTE,
      this.history.data,
    );
    gl.uniform1i(this.locations.uHeightMap, 0);
    gl.uniformMatrix4fv(this.locations.uViewProjection, false, viewProjection);
    gl.uniform3fv(this.locations.uCameraPosition, eye);
    gl.uniform3fv(this.locations.uLightDirection, lightDirection);
    gl.uniform3fv(this.locations.uBackground, background);
    gl.uniform1f(this.locations.uHistoryOffset, state.historyOffset);
    gl.uniform1f(
      this.locations.uHeightScale,
      0.48 + sub * 0.12 + bassBand * 0.18 + this.forecastGenes.cellular * 0.05,
    );
    gl.uniform1f(this.locations.uKick, kick);
    gl.uniform1f(this.locations.uBass, bass);
    gl.uniform1f(this.locations.uHat, hat);
    gl.uniform1f(this.locations.uChord, chord);
    gl.uniform1f(this.locations.uSynth, synth);
    gl.uniform1f(this.locations.uFlightX, flightX);
    gl.uniform1f(this.locations.uTime, time);
    gl.uniform1f(this.locations.uLightIntensity, 0.82 + clamp01(energy) * 0.38 + kick * 0.72);
    gl.uniform1f(
      this.locations.uRainbowPhase,
      time * (this.reducedMotion ? 0.012 : 0.045) + state.centroid * 1.7 + synth * 0.7,
    );
    gl.uniform1f(
      this.locations.uRainbowStrength,
      0.38 + presence * 0.22 + air * 0.5 + chord * 0.34 + state.flux * 0.26,
    );
    gl.uniform1f(
      this.locations.uRoughness,
      clamp(0.58 - hat * 0.32 + body * 0.12 + this.forecastGenes.grain * 0.08, 0.16, 0.78),
    );
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.BLEND);
    gl.clearColor(background[0], background[1], background[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.drawElements(gl.TRIANGLES, this.grid.indices.length, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
    return state;
  }

  dispose() {
    const gl = this.gl;
    gl.deleteTexture(this.heightTexture);
    gl.deleteBuffer(this.vertexBuffer);
    gl.deleteBuffer(this.indexBuffer);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
  }
}

export class CanvasSpectrumMountainFallback {
  constructor(canvas, { reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.context = canvas?.getContext?.("2d", { alpha: false }) || null;
    if (!this.context) throw new Error("Canvas2D unavailable");
    this.reducedMotion = reducedMotion;
    this.history = new SpectrumTerrainHistory({ columns: 72, rows: 30 });
    this.width = 1;
    this.height = 1;
    this.dpr = 1;
  }

  setSeed(seed) {
    this.history.reset(seed);
  }

  setForecast() {}

  resize(width, height, dpr = 1) {
    this.width = Math.max(1, Number(width) || 1);
    this.height = Math.max(1, Number(height) || 1);
    this.dpr = clamp(Number(dpr) || 1, 1, 1.5);
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  render({ now, delta, spectrum, sampleRate, active, pulses = {}, energy = 0.42 }) {
    const state = this.history.update(spectrum, sampleRate, delta, {
      active,
      reducedMotion: this.reducedMotion,
    });
    const context = this.context;
    const kick = clamp01(pulses.kick);
    context.fillStyle = "#02040a";
    context.fillRect(0, 0, this.width, this.height);
    const rows = [];
    for (let row = 0; row < this.history.rows; row += 1) {
      const depth = row / Math.max(1, this.history.rows - 1);
      const points = [];
      for (let column = 0; column < this.history.columns; column += 1) {
        const value = this.history.data[row * this.history.columns + column] / 255;
        const amount = column / Math.max(1, this.history.columns - 1);
        const xScale = 0.92 - depth * 0.3;
        points.push({
          x: this.width * (0.5 + (amount - 0.5) * xScale),
          y: this.height * (0.79 - depth * 0.57 - value * (0.24 - depth * 0.08) * (1 + kick * 0.4)),
        });
      }
      rows.push(points);
    }
    context.globalCompositeOperation = "source-over";
    for (let row = rows.length - 2; row >= 0; row -= 1) {
      const near = rows[row];
      const far = rows[row + 1];
      context.beginPath();
      context.moveTo(near[0].x, near[0].y);
      for (const point of near) context.lineTo(point.x, point.y);
      for (let index = far.length - 1; index >= 0; index -= 1) {
        context.lineTo(far[index].x, far[index].y);
      }
      context.closePath();
      const phase = row / rows.length + Number(now) * 0.000015 + state.centroid;
      const hue = (phase * 360) % 360;
      const gradient = context.createLinearGradient(0, near[0].y, this.width, far[0].y);
      gradient.addColorStop(0, `hsla(${hue},82%,72%,${0.12 + energy * 0.08})`);
      gradient.addColorStop(0.48, `rgba(236,240,244,${0.16 + kick * 0.08})`);
      gradient.addColorStop(1, `hsla(${(hue + 140) % 360},86%,68%,${0.12 + state.flux * 0.1})`);
      context.fillStyle = gradient;
      context.shadowColor = "rgba(0,0,0,.65)";
      context.shadowBlur = 8 + row * 0.2;
      context.shadowOffsetY = 5;
      context.fill();
    }
    context.shadowBlur = 0;
    context.shadowOffsetY = 0;
    return state;
  }

  dispose() {}
}
