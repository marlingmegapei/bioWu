/***************************************************************
 * TERRA DIVINATION - Code unique, version PIONS + BAGUA
 * p5.js version
 *
 * SOMMAIRE :
 *  - Chapitre 1 : Constants & Globals
 *  - Chapitre 2 : Clusters & effect matrices (3 clusters : exploration, stigmergy, resourceMgmt)
 *  - Chapitre 3 : Simulation classes & logic (Agent, Resource, PheromoneSegment)
 *  - Chapitre 4 : Interface (Bagua 3×3, Pions drag-and-drop, mouse interaction)
 *  - Chapitre 5 : Setup() & Draw() (main p5 loop)
 ***************************************************************/


/***************************************************************
 *               CHAPITRE 1 : CONSTANTS & GLOBALS
 ***************************************************************/

// Dimensions générales
const CONTROL_PANEL_WIDTH = 300;
const SIM_W = 600;
const SIM_H = 600;
const TOTAL_WIDTH = CONTROL_PANEL_WIDTH + SIM_W;

// Variables globales pour la simulation
let environment = {
  nestPos: null,
  nestRadius: 20
};

let agents = [];
let resources = [];
let pheromones = [];
let totalCollected = 0;

/***************************************************************
 * CHAPITRE 2 : CLUSTERS & EFFECT MATRICES (Version 4-clusters)
 ***************************************************************/

// 4 clusters : exploration, stigmergy, resourceMgmt, vitality
const clustersInitial = {
  exploration: {
    speed: 2,
    detectionRadius: 30,
    randomTurnProb: 0.05
  },
  stigmergy: {
    pheromoneLifetime: 300,
    depositThreshold: 5,
    pheromoneFollowWeight: 0.7
  },
  resourceMgmt: {
    resourceCount: 20,
    initialQuantity: 100,
    consumptionRate: 10
  },
  vitality: {
    lifetime: 2000,         // en ticks/frames
    reproductionRate: 0.01, // chance de faire naître un nouvel agent
    fatigueRate: 0.0005     // vitesse d’accumulation de fatigue
  }
};

// copie active
let clusters = JSON.parse(JSON.stringify(clustersInitial));

// Matrices d’effets
const effectMatrix_Exploration = {
  Qian: { speed: +1,  detectionRadius: +5,  randomTurnProb: -0.01 },
  Kun:  { speed: -0.5, detectionRadius: +10, randomTurnProb: -0.02 },
  Zhen: { speed: +1.5, detectionRadius: -5,  randomTurnProb: +0.03 },
  Xun:  { speed: +0.5, detectionRadius: +2,  randomTurnProb: +0.01 },
  Kan:  { speed: +0,   detectionRadius: +3,  randomTurnProb: +0.02 },
  Li:   { speed: +2,   detectionRadius: -2,  randomTurnProb: -0.01 },
  Gen:  { speed: -1,   detectionRadius: +8,  randomTurnProb: -0.03 },
  Dui:  { speed: +1,   detectionRadius: +3,  randomTurnProb: +0.01 }
};

const effectMatrix_Stigmergy = {
  Qian: { pheromoneLifetime: +50, depositThreshold: -1, pheromoneFollowWeight: +0.1 },
  Kun:  { pheromoneLifetime: +100, depositThreshold: +2, pheromoneFollowWeight: -0.1 },
  Zhen: { pheromoneLifetime: -50,  depositThreshold: -2, pheromoneFollowWeight: +0.2 },
  Xun:  { pheromoneLifetime: +20,  depositThreshold: -1, pheromoneFollowWeight: +0.05 },
  Kan:  { pheromoneLifetime: +0,   depositThreshold: +0, pheromoneFollowWeight: +0.1 },
  Li:   { pheromoneLifetime: -30,  depositThreshold: -1, pheromoneFollowWeight: +0.15 },
  Gen:  { pheromoneLifetime: +80,  depositThreshold: +3, pheromoneFollowWeight: -0.15 },
  Dui:  { pheromoneLifetime: +30,  depositThreshold: +0, pheromoneFollowWeight: +0.05 }
};

const effectMatrix_ResourceMgmt = {
  Qian: { resourceCount: +10, initialQuantity: +20, consumptionRate: +5 },
  Kun:  { resourceCount: +5,  initialQuantity: +40, consumptionRate: -5 },
  Zhen: { resourceCount: -5,  initialQuantity: -10, consumptionRate: +10 },
  Xun:  { resourceCount: +0,  initialQuantity: +10, consumptionRate: +0 },
  Kan:  { resourceCount: -10, initialQuantity: +0,  consumptionRate: -5 },
  Li:   { resourceCount: +10, initialQuantity: -20, consumptionRate: +5 },
  Gen:  { resourceCount: +0,  initialQuantity: +30, consumptionRate: -5 },
  Dui:  { resourceCount: +5,  initialQuantity: +5,  consumptionRate: +0 }
};

// Nouvelle matrice pour vitality
const effectMatrix_Vitality = {
  Qian: { lifetime: +300, reproductionRate: +0.005, fatigueRate: -0.0001 },
  Kun:  { lifetime: +500, reproductionRate: -0.01,  fatigueRate: +0.0003 },
  Zhen: { lifetime: -200, reproductionRate: +0.02,  fatigueRate: +0.0005 },
  Xun:  { lifetime: +0,   reproductionRate: +0.01,  fatigueRate: -0.0002 },
  Kan:  { lifetime: +100, reproductionRate: +0,     fatigueRate: -0.0003 },
  Li:   { lifetime: -300, reproductionRate: +0.02,  fatigueRate: +0.0006 },
  Gen:  { lifetime: +200, reproductionRate: -0.005, fatigueRate: -0.0001 },
  Dui:  { lifetime: +50,  reproductionRate: +0.005, fatigueRate: +0 }
};

/**
 * Appliquer un trigramme à un cluster
 */
function applyTrigramEffect(trigram, clusterName) {
  let matrix;
  if (clusterName === 'exploration') {
    matrix = effectMatrix_Exploration;
  } else if (clusterName === 'stigmergy') {
    matrix = effectMatrix_Stigmergy;
  } else if (clusterName === 'resourceMgmt') {
    matrix = effectMatrix_ResourceMgmt;
  } else if (clusterName === 'vitality') {
    matrix = effectMatrix_Vitality;
  } else {
    console.warn(`Cluster inconnu : ${clusterName}`);
    return;
  }

  let effect = matrix[trigram];
  if (!effect) return;

  for (let key in effect) {
    if (clusters[clusterName][key] !== undefined) {
      clusters[clusterName][key] += effect[key];
    }
  }
  console.log(`[${trigram}] appliqué à ${clusterName} =>`, effect, clusters[clusterName]);
}

/**
 * resetCluster(clusterName) : remet juste le cluster ciblé à ses valeurs initiales
 */
function resetCluster(clusterName) {
  clusters[clusterName] = JSON.parse(JSON.stringify(clustersInitial[clusterName]));
  console.log(`Cluster ${clusterName} réinitialisé =>`, clusters[clusterName]);
}



/***************************************************************
 *    CHAPITRE 3 : SIMULATION CLASSES & LOGIC
 ***************************************************************/

// Classes Agent, Resource, PheromoneSegment

class Agent {
  constructor(pos) {
    this.pos = pos.copy();
    this.dir = p5.Vector.random2D();
    this.state = "foraging";
    this.lastDepositPos = null;
  }

  update() {
    if (this.state === "foraging") {
      this.foragingBehavior();
    } else {
      this.returningBehavior();
    }

    let spd = clusters.exploration.speed;
    this.pos.add(p5.Vector.mult(this.dir, spd));

    // Gestion bords
    if (this.pos.x < 0 || this.pos.x > SIM_W) this.dir.x *= -1;
    if (this.pos.y < 0 || this.pos.y > SIM_H) this.dir.y *= -1;
  }

  foragingBehavior() {
    let target = this.findResource();
    if (target) {
      let desired = p5.Vector.sub(target.pos, this.pos).normalize();
      this.dir = desired;
      if (p5.Vector.dist(this.pos, target.pos) < clusters.exploration.detectionRadius/2) {
        this.collectResource(target);
      }
    } else {
      let detected = this.detectPheromone();
      if (detected) {
        let reverseDir = p5.Vector.mult(detected.direction, -1);
        this.dir.lerp(reverseDir, clusters.stigmergy.pheromoneFollowWeight);
        this.dir.normalize();
      } else {
        if (random() < clusters.exploration.randomTurnProb) {
          this.dir = p5.Vector.random2D();
        }
      }
    }
  }

  returningBehavior() {
    let dirToNest = p5.Vector.sub(environment.nestPos, this.pos).normalize();
    this.dir = dirToNest;

    if (this.lastDepositPos &&
        p5.Vector.dist(this.pos, this.lastDepositPos) > clusters.stigmergy.depositThreshold) {
      pheromones.push(new PheromoneSegment(
        this.lastDepositPos.x, this.lastDepositPos.y,
        this.pos.x, this.pos.y
      ));
      this.lastDepositPos = this.pos.copy();
    }

    if (p5.Vector.dist(this.pos, environment.nestPos) < environment.nestRadius) {
      this.state = "foraging";
      this.dir = p5.Vector.random2D();
    }
  }

  show() {
    noStroke();
    fill(255);
    ellipse(this.pos.x, this.pos.y, 4, 4);
  }

  findResource() {
    for (let r of resources) {
      if (r.quantity > 0 &&
          p5.Vector.dist(this.pos, r.pos) < clusters.exploration.detectionRadius) {
        return r;
      }
    }
    return null;
  }

  collectResource(resource) {
    resource.quantity -= clusters.resourceMgmt.consumptionRate;
    totalCollected += clusters.resourceMgmt.consumptionRate;
    this.state = "returning";
    this.lastDepositPos = this.pos.copy();

    if (resource.quantity <= 0) {
      let idx = resources.indexOf(resource);
      if (idx > -1) {
        resources.splice(idx, 1);
      }
    }
  }

  detectPheromone() {
    let best = null;
    let bestStrength = 0;
    for (let seg of pheromones) {
      let d = pointLineDistance(this.pos.x, this.pos.y,
                                seg.x1, seg.y1, seg.x2, seg.y2);
      if (d < clusters.exploration.detectionRadius && seg.strength>bestStrength) {
        best = seg;
        bestStrength = seg.strength;
      }
    }
    return best;
  }
}

class Resource {
  constructor() {
    this.pos = createVector(random(SIM_W), random(SIM_H));
    this.quantity = clusters.resourceMgmt.initialQuantity;
  }

  show() {
    noStroke();
    let brightness = map(this.quantity, 0, clusters.resourceMgmt.initialQuantity, 50, 255);
    fill(0, brightness, 0);
    ellipse(this.pos.x, this.pos.y, 16, 16);
  }
}

class PheromoneSegment {
  constructor(x1, y1, x2, y2) {
    this.x1 = x1;
    this.y1 = y1;
    this.x2 = x2;
    this.y2 = y2;
    this.life = clusters.stigmergy.pheromoneLifetime;
    this.maxLife = clusters.stigmergy.pheromoneLifetime;
    this.direction = createVector(x2 - x1, y2 - y1).normalize();
    this.strength = 255;
  }

  update() {
    this.life--;
    this.strength = map(this.life, 0, this.maxLife, 0, 255);
  }

  show() {
    stroke(100, 100, 255, this.strength);
    strokeWeight(2);
    line(this.x1, this.y1, this.x2, this.y2);
  }

  isFinished() {
    return (this.life <= 0);
  }
}

// Fonction utilitaire
function pointLineDistance(px, py, x1, y1, x2, y2) {
  let A = px - x1;
  let B = py - y1;
  let C = x2 - x1;
  let D = y2 - y1;
  let dot = A*C + B*D;
  let len_sq = C*C + D*D;
  let param = (len_sq!==0) ? dot/len_sq : -1;

  let xx, yy;
  if (param<0) { xx = x1; yy = y1; }
  else if (param>1) { xx = x2; yy = y2; }
  else { xx = x1 + param*C; yy = y1 + param*D; }

  let dx = px-xx;
  let dy = py-yy;
  return sqrt(dx*dx + dy*dy);
}


/***************************************************************
 *   CHAPITRE 4 : INTERFACE (Bagua + Pions + Drag-and-Drop)
 ***************************************************************/

// Bagua 3×3 : 8 trigrammes + 1 case centrale
let baguaData = [
  // row0
  [ {key:'Xun', symbol:'☴'}, {key:'Li', symbol:'☲'}, {key:'Kun', symbol:'☷'} ],
  // row1
  [ {key:'Zhen', symbol:'☳'}, {key:'CENTER', symbol:''}, {key:'Dui', symbol:'☱'} ],
  // row2
  [ {key:'Gen', symbol:'☶'}, {key:'Kan', symbol:'☵'}, {key:'Qian', symbol:'☰'} ]
];

let baguaCells = [];
let cellSize = 80;  // dimension d’une cellule

// Pions : 3 pions = exploration, stigmergy, resourceMgmt
let pieces = [];

class Piece {
  constructor(clusterName, ccol, x, y) {
    this.clusterName = clusterName;
    this.color = ccol;
    this.x = x; this.y = y;
    this.w = 40; this.h = 40;
    this.isDragging = false;
    this.offX = 0; this.offY = 0;
    this.currentCell = null;
  }

  draw() {
    push();
    fill(this.color);
    noStroke();
    rect(this.x, this.y, this.w, this.h, 8);
    fill(255);
    textSize(12);
    textAlign(CENTER, CENTER);
    text(this.clusterName[0].toUpperCase(), this.x+this.w/2, this.y+this.h/2);
    pop();
  }

  mouseOver(mx,my) {
    return (mx>=this.x && mx<=this.x+this.w && my>=this.y && my<=this.y+this.h);
  }
}

// Applique ou reset si on re-clique
function applyOrResetIfOnCell(p) {
  if (!p.currentCell) return;
  if (p.currentCell.key==='CENTER') {
    // reset cluster
    resetCluster(p.clusterName);
  } else {
    // applique trigram
    applyTrigramEffect(p.currentCell.key, p.clusterName);
  }
}

// Cherche la cell sous le pion
function getCellUnderPiece(p) {
  let cx = p.x + p.w/2;
  let cy = p.y + p.h/2;
  for (let c of baguaCells) {
    if (cx>=c.x && cx<=c.x+c.w && cy>=c.y && cy<=c.y+c.h) {
      return c;
    }
  }
  return null;
}


/***************************************************************
 *           CHAPITRE 5 : SETUP() & DRAW() (MAIN LOOP)
 ***************************************************************/

function setup() {
  createCanvas(TOTAL_WIDTH, SIM_H);

  // -- Construction bagua (3x3)
  let startX = 0;
  let startY = 100;  // Laisse un peu d’espace en haut
  for (let row=0; row<3; row++){
    for (let col=0; col<3; col++){
      let data = baguaData[row][col];
      baguaCells.push({
        row, col,
        x: startX + col*cellSize,
        y: startY + row*cellSize,
        w: cellSize,
        h: cellSize,
        key: data.key,
        symbol: data.symbol
      });
    }
  }

  // -- Création des 3 pions (exploration, stigmergy, resourceMgmt)
  pieces.push(new Piece('exploration', color(200,50,50), 50, 10));
  pieces.push(new Piece('stigmergy',   color(50,200,50), 100, 10));
  pieces.push(new Piece('resourceMgmt',color(50,50,200), 150, 10));
  pieces.push(new Piece('vitality', color(180,100,200), 200, 10));

  // -- Initialisation de la simulation
  environment.nestPos = createVector(SIM_W/2, SIM_H/2);
  for (let i=0; i<30; i++){
    agents.push(new Agent(environment.nestPos.copy()));
  }
  for (let i=0; i<clusters.resourceMgmt.resourceCount; i++){
    resources.push(new Resource());
  }
}

function draw() {
  background(51);

  // Panneau gauche
  push();
  noStroke();
  fill(80);
  rect(0,0, CONTROL_PANEL_WIDTH, SIM_H);
  drawBagua();
  drawPieces();
  pop();

  // Zone simulation à droite
  push();
  translate(CONTROL_PANEL_WIDTH, 0);
  drawSimulation();
  pop();

  // Debug
  showDebugText();
}

/** Dessin du bagua (grille) */
function drawBagua() {
  stroke(220);
  strokeWeight(2);
  for (let c of baguaCells) {
    fill(c.key==='CENTER'? 140 : 100);
    rect(c.x, c.y, c.w, c.h);
    fill(255);
    if (c.symbol!=='') {
      textSize(30);
      textAlign(CENTER, CENTER);
      text(c.symbol, c.x+c.w/2, c.y+c.h/2);
    } else if (c.key==='CENTER') {
      textSize(14);
      text('Reset', c.x+c.w/2, c.y+c.h/2);
    }
  }
}

/** Dessin des pions */
function drawPieces() {
  for (let p of pieces){
    p.draw();
  }
}

/** Simulation */
function drawSimulation() {
  noStroke();
  fill(51);
  rect(0,0, SIM_W, SIM_H);

  // Dessin du nid
  drawNest();

  // Ressources
  for (let r of resources) {
    r.show();
  }

  // Pheromones
  for (let i=pheromones.length-1; i>=0; i--){
    pheromones[i].update();
    pheromones[i].show();
    if (pheromones[i].isFinished()) {
      pheromones.splice(i,1);
    }
  }

  // Agents
  for (let a of agents){
    a.update();
    a.show();
  }

  // Infos
  fill(255);
  textSize(16);
  text(`Ressources restantes : ${resources.length}`, 10, SIM_H - 20);
  text(`Total collecté : ${totalCollected}`, 10, SIM_H - 40);
}

function drawNest() {
  noStroke();
  fill(255,200,0);
  ellipse(environment.nestPos.x, environment.nestPos.y, environment.nestRadius*2, environment.nestRadius*2);
}

/** Debug overlay (clusters, etc.) */
function showDebugText() {
  fill(255);
  textSize(14);
  text(`Exploration: speed=${clusters.exploration.speed.toFixed(2)}, randomTurnProb=${clusters.exploration.randomTurnProb.toFixed(3)}`, 310, 20);
  text(`Stigmergy: lifetime=${clusters.stigmergy.pheromoneLifetime}, followW=${clusters.stigmergy.pheromoneFollowWeight.toFixed(2)}`, 310, 40);
  text(`Resource: count=${clusters.resourceMgmt.resourceCount}, initQty=${clusters.resourceMgmt.initialQuantity}, consRate=${clusters.resourceMgmt.consumptionRate}`, 310, 60);
}


/** Gestion souris */
function mousePressed() {
  // Vérifie si on clique sur un pion
  if (mouseX<CONTROL_PANEL_WIDTH) {
    for (let i=pieces.length-1; i>=0; i--){
      let p = pieces[i];
      if (p.mouseOver(mouseX,mouseY)) {
        // on drag
        p.isDragging = true;
        p.offX = mouseX - p.x;
        p.offY = mouseY - p.y;
        // ramène p en premier plan
        pieces.push( pieces.splice(i,1)[0] );
        return;
      }
    }
  }
}

function mouseDragged() {
  // si un pion est en drag
  for (let p of pieces){
    if (p.isDragging) {
      p.x = mouseX - p.offX;
      p.y = mouseY - p.offY;
    }
  }
}

function mouseReleased() {
  // fin du drag
  for (let p of pieces){
    if (p.isDragging){
      p.isDragging = false;
      // On regarde si on est sur une cell
      let c = getCellUnderPiece(p);
      if (c) {
        // on centre la pièce
        p.x = c.x + (c.w - p.w)/2;
        p.y = c.y + (c.h - p.h)/2;
        p.currentCell = c;
        // applique ou reset
        if (c.key==='CENTER'){
          resetCluster(p.clusterName);
        } else {
          applyTrigramEffect(c.key, p.clusterName);
        }
      } else {
        p.currentCell = null;
      }
    }
  }
}
