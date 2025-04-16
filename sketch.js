/***************************************************************
 * TERRA DIVINATION - CODE COMPLET
 * 
 * CHAPITRES :
 *  1. CONSTANTS & GLOBALS
 *  2. CLUSTERS & MATRICES (4 CLUSTERS)
 *  3. SIMULATION CLASSES (Agent, Resource, Pheromone)
 *  4. INTERFACE (Bagua + Pions)
 *  5. GRAPHIQUES DE SUIVI
 *  6. SETUP & DRAW
 ***************************************************************/

/***************************************************************
 *                1) CONSTANTS & GLOBALS
 ***************************************************************/

const CONTROL_PANEL_WIDTH = 300;
const SIM_W = 600;
const SIM_H = 600;
const GRAPH_H = 200;               // espace en bas pour les graphes
const TOTAL_WIDTH = CONTROL_PANEL_WIDTH + SIM_W;
const TOTAL_HEIGHT = SIM_H + GRAPH_H;

let environment = {
  nestPos: null,
  nestRadius: 20
};

let agents = [];
let resources = [];
let pheromones = [];
let totalCollected = 0;

// Historique pour tracer nos graphes (4 param)
let history = {
  speed: [],      // historique de la vitesse
  antCount: []    // historique du nombre de fourmis
};

/***************************************************************
 *            2) CLUSTERS & MATRICES (4 CLUSTERS)
 ***************************************************************/

// Paramètres initiaux (un seul objet)
const clustersInitial = {
  speed: 2,
  detectionRadius: 30,
  randomTurnProb: 0.05,
  pheromoneLifetime: 300,
  pheromoneFollowWeight: 0.7,
  consumptionRate: 10,
  fatigueRate: 0.001,
  reproductionRate: 0.001,
  lifetime: 2000
};

// Copie active
let clusters = JSON.parse(JSON.stringify(clustersInitial));

// Quatre matrices (Exploration, Stigmergy, ResourceMgmt, Vitality)
const effectMatrix_Exploration = {
  Qian: { speed:+1, detectionRadius:+5, fatigueRate:+0.0005 },
  Kun:  { speed:-0.5, detectionRadius:+10, randomTurnProb:-0.02 },
  Zhen: { speed:+1.5, randomTurnProb:+0.03, fatigueRate:+0.001 },
  Xun:  { detectionRadius:+2, randomTurnProb:+0.01 },
  Kan:  { randomTurnProb:+0.02, fatigueRate:-0.0003 },
  Li:   { speed:+2, detectionRadius:-2, fatigueRate:+0.001 },
  Gen:  { speed:-1, detectionRadius:+8, randomTurnProb:-0.03 },
  Dui:  { speed:+1, detectionRadius:+3, fatigueRate:+0.0002 }
};

const effectMatrix_Stigmergy = {
  Qian: { pheromoneLifetime:+50, pheromoneFollowWeight:+0.1 },
  Kun:  { pheromoneLifetime:+100, pheromoneFollowWeight:-0.1, detectionRadius:-5 },
  Zhen: { pheromoneLifetime:-50, pheromoneFollowWeight:+0.2 },
  Xun:  { pheromoneLifetime:+20, detectionRadius:+3 },
  Kan:  { pheromoneFollowWeight:+0.1 },
  Li:   { pheromoneLifetime:-30, pheromoneFollowWeight:+0.15 },
  Gen:  { pheromoneLifetime:+80, pheromoneFollowWeight:-0.15, randomTurnProb:-0.02 },
  Dui:  { pheromoneLifetime:+30, pheromoneFollowWeight:+0.05 }
};

const effectMatrix_ResourceMgmt = {
  Qian: { consumptionRate:+5 },
  Kun:  { consumptionRate:-3 },
  Zhen: { consumptionRate:+10 },
  Xun:  { consumptionRate:+0 },
  Kan:  { consumptionRate:-5 },
  Li:   { consumptionRate:+8 },
  Gen:  { consumptionRate:-5 },
  Dui:  { consumptionRate:+2 }
};

const effectMatrix_Vitality = {
  Qian: { lifetime:+300, speed:-0.5 },
  Kun:  { lifetime:+500, fatigueRate:+0.0005 },
  Zhen: { lifetime:-200, reproductionRate:+0.01 },
  Xun:  { fatigueRate:-0.0002 },
  Kan:  { fatigueRate:-0.0003 },
  Li:   { lifetime:-300, reproductionRate:+0.005 },
  Gen:  { lifetime:+200, speed:-0.8 },
  Dui:  { lifetime:+50, reproductionRate:+0.003 }
};

// Application d'un trigramme
function applyTrigramEffect(trigram, clusterName) {
  let matrixes = {
    exploration: effectMatrix_Exploration,
    stigmergy: effectMatrix_Stigmergy,
    resourceMgmt: effectMatrix_ResourceMgmt,
    vitality: effectMatrix_Vitality
  };
  let mat = matrixes[clusterName];
  if (!mat) return;
  let effect = mat[trigram];
  if (!effect) return;
  for (let key in effect) {
    if (clusters[key] !== undefined) {
      clusters[key] += effect[key];
    }
  }
}

// reset : on rétablit toutes les valeurs du cluster
function resetCluster(clusterName) {
  // Pour simplifier, on reset tout
  // (si tu veux reset juste un cluster, il faut coder différemment)
  clusters = JSON.parse(JSON.stringify(clustersInitial));
}
function updateClusters() {
  // 1) on repart des valeurs de base
  clusters = JSON.parse(JSON.stringify(clustersInitial));

  // 2) pour chaque pion, on ajoute son effet trigram × clickCount
  const matrixes = {
    exploration:    effectMatrix_Exploration,
    stigmergy:      effectMatrix_Stigmergy,
    resourceMgmt:   effectMatrix_ResourceMgmt,
    vitality:       effectMatrix_Vitality
  };

  for (let p of pieces) {
    if (!p.currentCell || p.clickCount === 0) continue;
    let trigram = p.currentCell.key;
    let mat = matrixes[p.clusterName];
    if (!mat) continue;
    let effect = mat[trigram];
    if (!effect) continue;

    for (let param in effect) {
      if (clusters[param] !== undefined) {
        clusters[param] += effect[param] * p.clickCount;
        // pas de valeur négative
        clusters[param] = max(clusters[param], 0);
      }
    }
  }
}


/***************************************************************
 * 3) SIMULATION CLASSES & LOGIC
 ***************************************************************/

class Agent {
  constructor(pos) {
    this.pos = pos.copy();
    this.dir = p5.Vector.random2D();
    this.state = "foraging";
    this.age = 0;
    this.fatigue = 0;
    this.lastDepositPos = null;  // ← ajouté

    // (tes autres indicateurs éventuels)
    this.distanceMax = 0;
    this.turnCount = 0;
    this.pheromoneFollows = 0;
    this.resourcesCollected = 0;
  }
  // … suite de la classe …


  update() {
    // Vitalité
    this.age++;
    this.fatigue += clusters.fatigueRate;
    if (this.age > clusters.lifetime || this.fatigue >= 1) {
      agents.splice(agents.indexOf(this), 1);
      return;
    }

    // Comportement
    if (this.state === "foraging") {
      this.foragingBehavior();
    } else {
      this.returningBehavior();
    }

    // Déplacement
    let speedFactor = map(this.fatigue, 0, 1, 1, 0.2);
    let velocity = p5.Vector.mult(this.dir, clusters.speed * speedFactor);
    this.pos.add(velocity);

    // Bords
    if (this.pos.x < 0 || this.pos.x > SIM_W) this.dir.x *= -1;
    if (this.pos.y < 0 || this.pos.y > SIM_H) this.dir.y *= -1;

    // Reproduction
    if (random() < clusters.reproductionRate) {
      agents.push(new Agent(this.pos.copy()));
    }
  }

  foragingBehavior() {
    let target = this.findResource();
    if (target) {
      let desired = p5.Vector.sub(target.pos, this.pos).normalize();
      this.dir = desired;
      if (p5.Vector.dist(this.pos, target.pos) < clusters.detectionRadius/2) {
        this.collectResource(target);
      }
    } else {
      let detected = this.detectPheromone();
      if (detected) {
        // On incrémente un followCount pour épaissir la ligne
        detected.followCount++;
        let rev = p5.Vector.mult(detected.direction, -1);
        this.dir.lerp(rev, clusters.pheromoneFollowWeight).normalize();
      } else if (random() < clusters.randomTurnProb) {
        this.dir = p5.Vector.random2D();
      }
    }
  }

 returningBehavior() {
  // diriger vers le nid
  let toNest = p5.Vector.sub(environment.nestPos, this.pos).normalize();
  this.dir = toNest;

  // si jamais lastDepositPos n'existait pas, on l'initialise
  if (!this.lastDepositPos) {
    this.lastDepositPos = this.pos.copy();
  }

  // dépôt continu : on crée à chaque frame un nouveau segment
  pheromones.push(new PheromoneSegment(
    this.lastDepositPos.x, this.lastDepositPos.y,
    this.pos.x, this.pos.y
  ));
  // on met à jour le point de départ
  this.lastDepositPos = this.pos.copy();

  // dès qu'on atteint le nid, on reset l'état et lastDepositPos
  if (p5.Vector.dist(this.pos, environment.nestPos) < environment.nestRadius) {
    this.state = "foraging";
    this.dir = p5.Vector.random2D();
    this.lastDepositPos = null;  // ← ajouté
  }
}


 

  show() {
    noStroke();                // ← désactivation du contour
    fill(255);
    ellipse(this.pos.x, this.pos.y, 4, 4);
  }


  findResource() {
    return resources.find(r =>
      r.quantity > 0 &&
      p5.Vector.dist(this.pos, r.pos) < clusters.detectionRadius
    );
  }
collectResource(r) {
  // on décrémente la quantité
  r.quantity -= clusters.consumptionRate;
  totalCollected += clusters.consumptionRate;

  // on passe en mode « returning » et on prépare le dépôt de phéromones
  this.state = "returning";
  this.lastDepositPos = this.pos.copy();

  // si la ressource est épuisée, on la retire du tableau
  if (r.quantity <= 0) {
    const idx = resources.indexOf(r);
    if (idx > -1) {
      resources.splice(idx, 1);
    }
  }
}



  detectPheromone() {
    // On cherche le plus fort segment (max strength) dans le rayon
    let best = null;
    let bestVal = -999;
    for (let seg of pheromones) {
      let d = pointLineDistance(this.pos.x, this.pos.y, seg.x1, seg.y1, seg.x2, seg.y2);
      if (d < clusters.detectionRadius && seg.strength > bestVal) {
        best = seg;
        bestVal = seg.strength;
      }
    }
    return best;
  }
}

class Resource {
  constructor() {
    this.pos = createVector(random(SIM_W), random(SIM_H));
    this.quantity = 100;
  }

  show() {
    noStroke();
    let brightness = map(this.quantity, 0, 100, 50, 255);
    fill(0, brightness, 0);
    ellipse(this.pos.x, this.pos.y, 16, 16);
  }
}

class PheromoneSegment {
  constructor(x1, y1, x2, y2) {
    this.x1 = x1; this.y1 = y1;
    this.x2 = x2; this.y2 = y2;
    this.life = clusters.pheromoneLifetime;
    this.maxLife = clusters.pheromoneLifetime;
    this.strength = 255;
    this.direction = createVector(x2 - x1, y2 - y1).normalize();
    this.followCount = 0; // plus les agents la suivent, plus c'est épais
  }

  update() {
    this.life--;
    this.strength = map(this.life, 0, this.maxLife, 0, 255);
  }

  show() {
    let thick = 2 + this.followCount * 0.2;
    stroke(100,100,255, this.strength);
    strokeWeight(thick);
    line(this.x1, this.y1, this.x2, this.y2);
  }

  isFinished() {
    return this.life <= 0;
  }
}

// Distance point->segment (utilitaire)
function pointLineDistance(px, py, x1, y1, x2, y2) {
  let A = px - x1;
  let B = py - y1;
  let C = x2 - x1;
  let D = y2 - y1;
  let dot = A*C + B*D;
  let len_sq = C*C + D*D;
  let param = (len_sq !== 0) ? dot/len_sq : -1;

  let xx, yy;
  if (param<0){xx=x1; yy=y1;}
  else if(param>1){xx=x2; yy=y2;}
  else {
    xx = x1 + param*C;
    yy = y1 + param*D;
  }
  let dx=px-xx, dy=py-yy;
  return sqrt(dx*dx + dy*dy);
}

/***************************************************************
 * 4) INTERFACE (Bagua + Pions)
 ***************************************************************/

// Bagua
let baguaData = [
  [ {key:'Xun', symbol:'☴'}, {key:'Li', symbol:'☲'}, {key:'Kun', symbol:'☷'} ],
  [ {key:'Zhen', symbol:'☳'}, {key:'CENTER', symbol:''}, {key:'Dui', symbol:'☱'} ],
  [ {key:'Gen', symbol:'☶'}, {key:'Kan', symbol:'☵'}, {key:'Qian', symbol:'☰'} ]
];
let baguaCells = [];
let cellSize = 80;

let pieces = [];

class Piece {
  constructor(clusterName, ccol, x, y) {
    this.clusterName = clusterName;
    this.color = ccol;
    this.x = x; this.y = y;
    this.w = 40; this.h = 40;
    this.isDragging = false;
    this.offX = 0; this.offY = 0;
    this.currentCell = null;  // la cellule sur laquelle il est posé
    this.clickCount = 0;      // nombre de clics cumulés sur cette cellule
  }

  draw() {
    push();
    fill(this.color);
    noStroke();
    rect(this.x, this.y, this.w, this.h, 8);
    fill(255);
    textSize(12);
    textAlign(CENTER, CENTER);
    text(this.clusterName[0].toUpperCase(), this.x + this.w/2, this.y + this.h/2);
    pop();
  }

  mouseOver(mx, my) {
    return (mx > this.x && mx < this.x + this.w && my > this.y && my < this.y + this.h);
  }

  applyClick(cell) {
    if (cell.key === 'CENTER') {
      // reset de ce pion
      this.currentCell = null;
      this.clickCount = 0;
    } else {
      if (this.currentCell && this.currentCell.key === cell.key) {
        // recliquer sur la même case => on cumule
        this.clickCount++;
      } else {
        // nouveau placement
        this.currentCell = cell;
        this.clickCount = 1;
      }
    }
  }
}


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
 * 5) GRAPHIQUES DE SUIVI DES CLUSTERS
 ***************************************************************/

function updateClusterHistory() {
  // On ajoute un point chaque 10 frames
  if (frameCount % 10 !== 0) return;

  // 1) vitesse du cluster exploration
  history.speed.push(clusters.speed);
  // 2) nombre actuel d'agents (fourmis)
  history.antCount.push(agents.length);

  // limiter la longueur historique
  let maxLen = SIM_W;
  if (history.speed.length > maxLen)   history.speed.shift();
  if (history.antCount.length > maxLen) history.antCount.shift();
}

function drawClusterGraphs() {
  // deux graphes de hauteur égale
  let each   = GRAPH_H / 2;
  let keys   = ['speed', 'antCount'];
  let labels = ['Speed', 'Ants'];

  for (let i = 0; i < 2; i++) {
    let startY = SIM_H + i * each;

    // cadre
    noFill();
    stroke(150);
    rect(CONTROL_PANEL_WIDTH, startY, SIM_W, each);

    // récupère l'historique ou un tableau vide
    let arr = history[keys[i]] || [];
    // évite max([]) => on prend 1 par défaut
    let maxVal = arr.length ? max(arr) : 1;

    // tracé de la courbe
    stroke(255);
    beginShape();
    for (let x = 0; x < arr.length; x++) {
      let val = arr[x];
      let y = map(val, 0, maxVal, startY + each, startY);
      vertex(CONTROL_PANEL_WIDTH + x, y);
    }
    endShape();

    // label
    noStroke();
    fill(200);
    textSize(14);
    text(labels[i], CONTROL_PANEL_WIDTH + 5, startY + 20);
  }
}


/***************************************************************
 * 6) SETUP & DRAW (MAIN LOOP)
 ***************************************************************/

function setup() {
  createCanvas(TOTAL_WIDTH, TOTAL_HEIGHT);

  // Bagua cells
  for (let row=0; row<3; row++) {
    for (let col=0; col<3; col++) {
      let data = baguaData[row][col];
      baguaCells.push({
        row, col,
        x: col*cellSize,
        y: 100 + row*cellSize,
        w: cellSize, h: cellSize,
        ...data
      });
    }
  }

  // 4 pions
  pieces.push(new Piece('exploration', color(200,50,50), 50, 10));
  pieces.push(new Piece('stigmergy', color(50,200,50), 100, 10));
  pieces.push(new Piece('resourceMgmt', color(50,50,200), 150, 10));
  pieces.push(new Piece('vitality', color(180,100,200), 200, 10));

  environment.nestPos = createVector(SIM_W/2, SIM_H/2);

  // Agents + ressources
  for (let i=0; i<30; i++){
    agents.push(new Agent(environment.nestPos.copy()));
  }
  for (let i=0; i<20; i++){
    resources.push(new Resource());
  }
}

function draw() {
  background(51);

  // Panel gauche
  fill(80); noStroke();
  rect(0, 0, CONTROL_PANEL_WIDTH, SIM_H);

  drawBagua();
  pieces.forEach(p=>p.draw());

  // Zone simulation
  push();
  translate(CONTROL_PANEL_WIDTH, 0);
  drawSimulation();
  pop();

  // Mise à jour
  updateClusterHistory();

  // Graphes
  drawClusterGraphs();
}

function drawBagua() {
  for (let c of baguaCells) {
    stroke(220);
    fill(c.key==='CENTER'?140:100);
    rect(c.x, c.y, c.w, c.h);
    fill(255);
    textAlign(CENTER,CENTER);
    if (c.symbol) {
      textSize(30);
      text(c.symbol, c.x+c.w/2, c.y+c.h/2);
    } else if (c.key==='CENTER') {
      textSize(14);
      text('Reset', c.x+c.w/2, c.y+c.h/2);
    }
  }
}
function drawSimulation() {
  noStroke();  // ← ajouté en tout début pour désactiver le contour

  drawNest();

  resources.forEach(r => r.show());

  pheromones.forEach(p => {
    p.update();
    p.show();
  });
  pheromones = pheromones.filter(p => !p.isFinished());

  agents.forEach(a => {
    a.update();
    a.show();
  });

  fill(255);
  textSize(14);
  text(`Ressources : ${resources.length}  Collecté : ${totalCollected}`, 10, SIM_H - 20);
}


function drawNest() {
  noStroke();                // ← désactivation du contour
  fill(255, 200, 0);
  ellipse(environment.nestPos.x, environment.nestPos.y, environment.nestRadius * 2);
}


// Input
function mousePressed() {
  for (let p of pieces) {
    if (p.mouseOver(mouseX, mouseY)) {
      p.isDragging = true;
      p.offX = mouseX - p.x;
      p.offY = mouseY - p.y;
    }
  }
}

function mouseDragged() {
  for (let p of pieces) {
    if (p.isDragging) {
      p.x = mouseX - p.offX;
      p.y = mouseY - p.offY;
    }
  }
}
function mouseReleased() {
  for (let p of pieces) {
    if (p.isDragging) {
      p.isDragging = false;
      let c = getCellUnderPiece(p);
      if (c) {
        // on recentre visuellement le pion
        p.x = c.x + (c.w - p.w)/2;
        p.y = c.y + (c.h - p.h)/2;
        // on gère le compteur de clics / reset via applyClick
        p.applyClick(c);
      }
    }
  }
  // on recalcule tous les clusters après chaque modification de pion
  updateClusters();
}
