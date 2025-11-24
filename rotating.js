function showError(errorText) {
  const box = document.getElementById("error-box");
  const p = document.createElement("p");
  p.innerText = errorText;
  box.appendChild(p);
  console.error(errorText);
}

// --- Matrix utilities ---
function identityMatrix() {
  return [
    1,0,0,0,
    0,1,0,0,
    0,0,1,0,
    0,0,0,1
  ];
}

function getPerspectiveMatrix(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);
  const rangeInv = 1 / (near - far);

  return [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (near + far) * rangeInv, -1,
    0, 0, near * far * rangeInv * 2, 0
  ];
}

// --- Letter width definitions (for spacing) ---
function getLetterWidth(letter) {
  switch (letter) {
    case 'D': return 0.75;
    case 'O': return 0.75;
    case 'G': return 0.75;
    case 'E': return 0.75;
    default: return 0.75;
  }
}

// --- Geometry creation ---
function createBlock(x, y, z, w, h, d, offset) {
  const hw = w/2, hh = h/2, hd = d/2;

  const verts = [
    x-hw, y+hh, z+hd,
    x-hw, y-hh, z+hd,
    x+hw, y-hh, z+hd,
    x+hw, y+hh, z+hd,
    x-hw, y+hh, z-hd,
    x-hw, y-hh, z-hd,
    x+hw, y+hh, z-hd,
    x+hw, y-hh, z-hd
  ];

  const idx = [
    0,1,2, 0,2,3,
    4,5,7, 4,7,6,
    3,2,7, 3,7,6,
    0,1,5, 0,5,4,
    0,3,6, 0,6,4,
    1,2,7, 1,7,5
  ].map(i => i + offset);

  return {vertices: verts, indices: idx};
}

function generateLetterGeometry(letter, centerX, vertexOffset) {
  let vertices = [];
  let indices = [];
  let offset = vertexOffset;

  const WIDTH = 1.0;
  const THICK = 0.22;
  const BAR = 0.65;

  const add = (x,y,w,h) => {
    const block = createBlock(centerX + x, y, 0, w, h, THICK, offset);
    vertices = vertices.concat(block.vertices);
    indices = indices.concat(block.indices);
    offset += 8;
  };

  switch(letter) {
    case 'D':
      add(-0.35, 0, 0.2, 1.0);
      add(0.05, 0.4, BAR, 0.2);
      add(0.05, -0.4, BAR, 0.2);
      add(0.35, 0, 0.2, 1.0);
      break;

    case 'O':
      add(-0.4, 0, 0.2, 1.0);
      add(0.4, 0, 0.2, 1.0);
      add(0, 0.4, 0.85, 0.2);
      add(0, -0.4, 0.85, 0.2);
      break;

    case 'G':
        add(-0.35, 0, 0.2, 1.0);
        add(0, 0.4, 0.75, 0.2);
        add(0, -0.4, 0.75, 0.2);
        add(0.25, 0, 0.5, 0.2);
        add(0.40, -0.15, 0.2, 0.55);
        break;

    case 'E':
    // Vertical spine
        add(-0.35, 0, 0.20, 1.0);

    // Top bar (fully connected)
        add(0.10, 0.40, 0.80, 0.20);

    // Middle bar (same width + aligned to spine)
        add(0.05, 0.00, 0.70, 0.20);

    // Bottom bar (same width as top, connects properly)
        add(0.10, -0.40, 0.80, 0.20);
        break;
}

  return {vertices, indices, nextOffset: offset};
}

// --- Main drawing ---
function draw3DLogo() {
  const canvas = document.getElementById("demo-canvas");
  const gl = canvas.getContext("webgl2");
  if (!gl) return showError("WebGL2 not supported.");

  const word = "DOGE";
  const GAP = 0.35;

  // Compute center spacing
  let totalWidth = 0;
  for (let i = 0; i < word.length; i++) {
    totalWidth += getLetterWidth(word[i]);
    if (i < word.length - 1) totalWidth += GAP;
  }
  let cursor = -totalWidth / 2;

  let verts = [];
  let idx = [];
  let offset = 0;

  for (const letter of word) {
    const w = getLetterWidth(letter);
    const data = generateLetterGeometry(letter, cursor + w/2, offset);
    verts = verts.concat(data.vertices);
    idx = idx.concat(data.indices);
    offset = data.nextOffset;
    cursor += w + GAP;
  }

  const vArr = new Float32Array(verts);
  const iArr = new Uint16Array(idx);

  const posBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, vArr, gl.STATIC_DRAW);

  const iBuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, iArr, gl.STATIC_DRAW);

  const vSrc = `#version 300 es
    in vec3 aPosition;
    uniform mat4 uModelView;
    uniform mat4 uProj;
    void main() {
      gl_Position = uProj * uModelView * vec4(aPosition, 1.0);
    }
  `;

  const fSrc = `#version 300 es
    precision mediump float;
    out vec4 outColor;
    void main() {
      outColor = vec4(0.1, 0.6, 0.9, 1.0);
    }
  `;

  function compile(src, type) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      showError(gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  const vs = compile(vSrc, gl.VERTEX_SHADER);
  const fs = compile(fSrc, gl.FRAGMENT_SHADER);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);

  const aPos = gl.getAttribLocation(prog, "aPosition");
  const uModelView = gl.getUniformLocation(prog, "uModelView");
  const uProj = gl.getUniformLocation(prog, "uProj");

  gl.useProgram(prog);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(aPos);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iBuf);

  gl.clearColor(0.05, 0.05, 0.05, 1);
  gl.enable(gl.DEPTH_TEST);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const proj = getPerspectiveMatrix(Math.PI/3, canvas.width / canvas.height, 0.1, 100);
  gl.uniformMatrix4fv(uProj, false, proj);

  const mv = identityMatrix();
  const angle = 20 * Math.PI / 180;
  mv[0] = Math.cos(angle);
  mv[2] = Math.sin(angle);
  mv[8] = -Math.sin(angle);
  mv[10] = Math.cos(angle);
  mv[14] = -7;

  gl.uniformMatrix4fv(uModelView, false, mv);

  gl.drawElements(gl.TRIANGLES, iArr.length, gl.UNSIGNED_SHORT, 0);
}

try { draw3DLogo(); }
catch (e) { showError(e); }
