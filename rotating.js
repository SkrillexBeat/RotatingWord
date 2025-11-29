/* ---------------------------------------------------------
   Matrix helpers
--------------------------------------------------------- */
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
    const inv = 1 / (near - far);

    return [
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (near + far) * inv, -1,
        0, 0, near * far * inv * 2, 0
    ];
}

function scaleMatrix(m, s) {
    m[0]  *= s;
    m[5]  *= s;
    m[10] *= s;
}

/* ---------------------------------------------------------
   Letter widths
--------------------------------------------------------- */
function getLetterWidth(c) {
    return 0.75; // all letters same width for spacing
}

/* ---------------------------------------------------------
   Geometry builders
--------------------------------------------------------- */
function createBlock(x, y, z, w, h, d, offset) {
    const hw = w/2, hh = h/2, hd = d/2;

    const vertices = [
        x-hw, y+hh, z+hd,
        x-hw, y-hh, z+hd,
        x+hw, y-hh, z+hd,
        x+hw, y+hh, z+hd,

        x-hw, y+hh, z-hd,
        x-hw, y-hh, z-hd,
        x+hw, y+hh, z-hd,
        x+hw, y-hh, z-hd
    ];

    const indices = [
        0,1,2, 0,2,3,
        4,5,7, 4,7,6,
        3,2,7, 3,7,6,
        0,1,5, 0,5,4,
        0,3,6, 0,6,4,
        1,2,7, 1,7,5
    ].map(i => i + offset);

    return { vertices, indices };
}

function generateLetterGeometry(letter, cx, startOffset) {
    let verts = [];
    let inds  = [];
    let offset = startOffset;

    const THICK = extrusionDepth;

    // helper to add a block part
    function add(x, y, w, h) {
        const part = createBlock(cx + x, y, 0, w, h, THICK, offset);
        verts = verts.concat(part.vertices);
        inds  = inds.concat(part.indices);
        offset += 8;
    }

    // manual shape layout for each letter
    switch (letter) {
        case "D":
            add(-0.35, 0,   0.2, 1.0);
            add(-0.20, 0.4, 0.75, 0.2);
            add(-0.20,-0.4, 0.75, 0.2);
            add(0.25, 0,    0.2, 1.0);
            break;

        case "O":
            add(-0.4, 0,    0.2, 1.0);
            add( 0.4, 0,    0.2, 1.0);
            add( 0,   0.4,  0.85,0.2);
            add( 0,  -0.4,  0.85,0.2);
            break;

        case "G":
            add(-0.35, 0,   0.2, 1.0);
            add(0, 0.4,     0.9, 0.2);
            add(0,-0.4,     0.75,0.2);
            add(0.25,0,     0.5, 0.2);
            add(0.40,-0.225,0.2, 0.55);
            break;

        case "E":
            add(-0.3,  0,    0.20,1.0);
            add( 0.10, 0.40, 0.80,0.20);
            add( 0.05, 0,    0.60,0.20);
            add( 0.10,-0.40, 0.80,0.20);
            break;
    }

    return { vertices: verts, indices: inds, nextOffset: offset };
}

/* ---------------------------------------------------------
   Global WebGL state
--------------------------------------------------------- */
let gl, prog;
let indicesLength = 0;

let uModelViewLoc, uProjLoc, uColor;

let isPlaying = false;
let animationId;

let extrusionDepth  = 0.22;
let animationSpeed  = 1.0;
let logoColor       = [0.06, 0.9, 0.9, 1.0];
let backgroundTheme = "dark";

// animation time state
let timeStart = performance.now();
let pauseTime = 0;

/* ---------------------------------------------------------
   Initialize WebGL, build geometry, shader setup
--------------------------------------------------------- */
function initWebGL() {
    const canvas = document.getElementById("demo-canvas");
    gl = canvas.getContext("webgl2");
    if (!gl) return showError("WebGL2 not supported");

    const text = "DOGE";
    const GAP = 0.35;

    // compute total width for centering
    let total = 0;
    for (let i=0; i<text.length; i++) {
        total += getLetterWidth(text[i]);
        if (i < text.length - 1) total += GAP;
    }
    let cx = -total / 2;

    // build vertex + index arrays
    let verts = [];
    let idx   = [];
    let vOff  = 0;

    for (const ch of text) {
        const w = getLetterWidth(ch);
        const g = generateLetterGeometry(ch, cx + w/2, vOff);

        verts = verts.concat(g.vertices);
        idx   = idx.concat(g.indices);

        vOff = g.nextOffset;
        cx += w + GAP;
    }

    indicesLength = idx.length;

    // upload data
    const vArr = new Float32Array(verts);
    const iArr = new Uint16Array(idx);

    const vBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vBuf);
    gl.bufferData(gl.ARRAY_BUFFER, vArr, gl.STATIC_DRAW);

    const iBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, iArr, gl.STATIC_DRAW);

    // shader sources
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
        uniform vec4 uColor;
        out vec4 outColor;
        void main() {
            outColor = uColor;
        }
    `;

    // compile helper
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

    // make program
    prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        showError("Shader link error");
        return;
    }

    gl.useProgram(prog);

    // get uniforms
    uModelViewLoc = gl.getUniformLocation(prog, "uModelView");
    uProjLoc      = gl.getUniformLocation(prog, "uProj");
    uColor        = gl.getUniformLocation(prog, "uColor");

    // attribute + VAO
    const aPos = gl.getAttribLocation(prog, "aPosition");

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, vBuf);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(aPos);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iBuf);

    // setup GL
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0.05, 0.05, 0.05, 0);

    // upload projection
    const proj = getPerspectiveMatrix(Math.PI/3, canvas.width / canvas.height, 0.1, 100);
    gl.uniformMatrix4fv(uProjLoc, false, proj);

    // initial mv matrix
    const mv = identityMatrix();
    const ang = 20 * Math.PI / 180;
    mv[0] = Math.cos(ang);
    mv[2] = Math.sin(ang);
    mv[8] = -Math.sin(ang);
    mv[10] = Math.cos(ang);
    mv[14] = -7;

    gl.uniformMatrix4fv(uModelViewLoc, false, mv);

    // color uniform
    gl.uniform4fv(uColor, logoColor);

    // draw one frame
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.drawElements(gl.TRIANGLES, indicesLength, gl.UNSIGNED_SHORT, 0);
}

/* ---------------------------------------------------------
   Animation render function
--------------------------------------------------------- */
function render(ts) {
    if (!isPlaying) {
        animationId = requestAnimationFrame(render);
        return;
    }

    const time = ((ts - timeStart) / 1000) * animationSpeed;

    let scale = 1.0;
    let rotY  = 0;
    let rotX  = 0;
    const Z   = -7;

    if (time < 4) {
        rotY = Math.sin(time * (Math.PI/2)) * Math.PI;
    }
    else if (time < 6) {
        const t = (time - 4) / 2;
        const smooth = t*t*(3 - 2*t);
        scale = 1 + (0.5 * smooth);
    }
    else {
        const t = time - 5;
        rotX = t * (Math.PI * 0.7);

        // bouncing
        const Y = Math.abs(Math.sin(t * Math.PI)) * 1.2 - 0.6;

        // breathing scale + sway
        scale = 1.5 + Math.cos(t * 3) * 0.2;
        rotY  = Math.sin(t * 1.5) * 0.3;
    }

    // build mv
    const mv = identityMatrix();

    const cy = Math.cos(rotY), sy = Math.sin(rotY);
    const cx = Math.cos(rotX), sx = Math.sin(rotX);

    mv[0] = cy;
    mv[2] = sy;
    mv[8] = -sy;
    mv[10]= cy;

    mv[5] = cx;
    mv[6] = sx;
    mv[9] = -sx;
    mv[10]= cx;

    mv[14] = Z;

    scaleMatrix(mv, scale);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(uModelViewLoc, false, mv);
    gl.uniform4fv(uColor, logoColor);

    gl.drawElements(gl.TRIANGLES, indicesLength, gl.UNSIGNED_SHORT, 0);

    animationId = requestAnimationFrame(render);
}

/* ---------------------------------------------------------
   UI setup + events
--------------------------------------------------------- */
window.onload = function () {
    initWebGL();

    const playBtn  = document.getElementById("play-btn");
    const pauseBtn = document.getElementById("pause-btn");
    const resetBtn = document.getElementById("reset-btn");

    const depth    = document.getElementById("input-depth");
    const speed    = document.getElementById("input-speed");
    const color    = document.getElementById("input-color");
    const bg       = document.getElementById("input-bg");

    const depthLbl = document.getElementById("val-depth");
    const speedLbl = document.getElementById("val-speed");

    playBtn.onclick = () => {
        if (!isPlaying) {
            isPlaying = true;
            timeStart = performance.now() - pauseTime;

            playBtn.disabled  = true;
            pauseBtn.disabled = false;
        }
    };

    pauseBtn.onclick = () => {
        if (isPlaying) {
            isPlaying = false;
            pauseTime = performance.now() - timeStart;

            playBtn.disabled  = false;
            pauseBtn.disabled = true;
        }
    };

    resetBtn.onclick = () => {
        timeStart = performance.now();
        pauseTime = 0;
        isPlaying = true;

        playBtn.disabled  = true;
        pauseBtn.disabled = false;
    };

    depth.addEventListener("input", () => {
        extrusionDepth = parseFloat(depth.value);
        depthLbl.textContent = extrusionDepth.toFixed(2);
        initWebGL();
    });

    speed.addEventListener("input", () => {
        animationSpeed = parseFloat(speed.value);
        speedLbl.textContent = animationSpeed.toFixed(1) + "x";
    });

    color.addEventListener("input", () => {
        const c = color.value;
        logoColor = [
            parseInt(c.substring(1,3),16) / 255,
            parseInt(c.substring(3,5),16) / 255,
            parseInt(c.substring(5,7),16) / 255,
            1
        ];
    });

    bg.addEventListener("change", () => {
        const wrap = document.getElementById("canvas-wrapper");

        switch (bg.value) {
            case "dark":
                document.body.style.backgroundColor = "#1a1a1a";
                wrap.style.backgroundColor = "#111";
                wrap.style.backgroundImage = "";
                break;
            case "light":
                document.body.style.backgroundColor = "#eee";
                wrap.style.backgroundColor = "#fff";
                wrap.style.backgroundImage = "";
                break;
            case "blue":
                document.body.style.backgroundColor = "#0b1d3a";
                wrap.style.backgroundColor = "#112a4d";
                wrap.style.backgroundImage = "";
                break;
            case "animeBg":
                wrap.style.backgroundColor = "#000"; // fallback
                wrap.style.backgroundImage = "url('https://i.postimg.cc/nr3CwrQb/anime-bg.jpg')";
                wrap.style.backgroundSize = "cover";
                wrap.style.backgroundPosition = "center";
                break;
        }
    });

    // keyboard shortcuts
    window.addEventListener("keydown", e => {
        if (e.key === " ") {
            e.preventDefault();
            if (isPlaying) pauseBtn.click();
            else playBtn.click();
        }
        if (e.key === "r" || e.key === "R") {
            resetBtn.click();
        }
    });

    // handle resize
    window.addEventListener("resize", () => {
        const c = gl.canvas;
        c.width  = c.clientWidth;
        c.height = c.clientHeight;

        const proj = getPerspectiveMatrix(Math.PI/3, c.width/c.height, 0.1, 100);
        gl.uniformMatrix4fv(uProjLoc, false, proj);
    });

    // start animation loop
    timeStart = performance.now();
    requestAnimationFrame(render);
};


