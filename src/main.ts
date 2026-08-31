import './style.css';

type Point = { x: number; y: number };
type ForestCircle = { x: number; y: number; radius: number; color: string };
type Landmass = { points: Point[]; forestCircles: ForestCircle[]; shorePath: Path2D; baseForestColor: string; rocks: ForestCircle[]; mountainPeaks: ForestCircle[] };
type Buffalo = { x: number; y: number; phase: number; heading: number };
type MantaMember = { x: number; y: number; phase: number; scale: number };
type BayDolphin = { angle: number; speed: number; radius: number; phase: number };
type BayFish = { angle: number; speed: number; radius: number; size: number };
type WildlifeScene = { dolphinBay: Point; mantaCenter: Point };
type Octopus = { x: number; y: number; phase: number; emergedUntil: number };
type Whirlpool = { x: number; y: number; radius: number; pullRadius: number };
type FogPatch = { x: number; y: number; radius: number; seed: number; driftAngle: number; driftSpeed: number };
type WhaleMember = {
  x: number; y: number; heading: number;
  along: number; lateral: number; phase: number; size: number;
  nextBlowAt: number; blowingUntil: number;
};
type WhalePod = { x: number; y: number; heading: number; speed: number; members: WhaleMember[] };
type GullMember = { dx: number; dy: number; phase: number };
type Flock = { x: number; y: number; vx: number; members: GullMember[] };
type TurtleMode = 'swim' | 'toShore' | 'rest' | 'toSwim';
type Turtle = {
  shoreX: number; shoreY: number;
  swimX: number; swimY: number;
  heading: number;
  swimSeed: number;
  size: number;
  mode: TurtleMode;
  modeElapsed: number;
  swimDuration: number;
  restDuration: number;
};

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas')!;
const context = canvas.getContext('2d')!;
const distanceElement = document.querySelector<HTMLElement>('#distance')!;
const elapsedTimeElement = document.querySelector<HTMLElement>('#elapsed-time')!;
const statusElement = document.querySelector<HTMLElement>('#voyage-status')!;
const startBanner = document.querySelector<HTMLElement>('#start-banner')!;
const navLeftButton = document.querySelector<HTMLButtonElement>('#nav-left')!;
const navRightButton = document.querySelector<HTMLButtonElement>('#nav-right')!;

const world = { width: 1200, height: 1200 };
const shorelineWidth = 10;
const cliffedgeWidth = 3;
const grassWidth = 6;
const shorelineColor = '#d8c39a';
const cliffedgeColor = '#80552f';
const grassColor = '#4f9d45';
const forestColor = '#24502b';
const shallowsColor = '#9edff0';
const deepColor = '#4a9ab8';
const shallowWaterDistance = 50;
const gridSpacing = 100;
const keys = new Set<string>();
const boat = { x: world.width / 2, y: 790, width: 36, height: 78 };
let scroll = 0;
let survived = 0;
let crashed = false;
let crashKind: 'land' | 'whirlpool' | null = null;
let turtleSlowUntil = 0;
let turtleSlowActive = false;
let started = false;
let dolphinPodElapsed: number | null = null;
let dolphinPodSeen = false;
let dolphinBayCenter: Point | null = null;
let dolphinBay: BayDolphin[] = [];
let dolphinBayFish: BayFish[] = [];
let mantaSchool: MantaMember[] = [];
let wildlifeScene: WildlifeScene | null = null;
let wildlifeMinute = 1;
const octopuses: Octopus[] = [];
const turtles: Turtle[] = [];
const buffaloes: Buffalo[] = [];
let fogPatches: FogPatch[] = [];
let fogCooldown = 6000 + Math.random() * 6000;
let whirlpools: Whirlpool[] = [];
let whirlpoolCooldown = 5000;
let sinkingWhirlpool: Whirlpool | null = null;
let sinkingElapsed = 0;
let sinkStartAngle = 0;
let sinkStartRadius = 0;
const whirlpoolSinkDuration = 1800;
let whalePods: WhalePod[] = [];
let whalePodCooldown = 5000;
let flocks: Flock[] = [];
let flockCooldown = 4000 + Math.random() * 6000;
let lastTime = performance.now();

const landmasses: Landmass[] = [];
const forestColors = ['#2f6b35', '#367d3b', '#438f43', '#28602f', '#559b4d', '#1f5429'];
const rockColors = ['#8a8578', '#726d5f', '#9c9686', '#7d7864', '#5f5b4f'];
const mountainColors = ['#7d7565', '#948c78', '#665f52'];
const mountainHighlight = '#c9c2ab';
const farForestThreshold = boat.y - 4500;

function hexToRgb(hex: string) {
  const value = parseInt(hex.slice(1), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function rgbToHex(r: number, g: number, b: number) {
  const clamp = (channel: number) => Math.max(0, Math.min(255, Math.round(channel)));
  return `#${((1 << 24) + (clamp(r) << 16) + (clamp(g) << 8) + clamp(b)).toString(16).slice(1)}`;
}

function shiftForestColor(hex: string, satDelta: number, lightDelta: number) {
  const { r, g, b } = hexToRgb(hex);
  const rf = r / 255;
  const gf = g / 255;
  const bf = b / 255;
  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === rf) h = ((gf - bf) / d) % 6;
    else if (max === gf) h = (bf - rf) / d + 2;
    else h = (rf - gf) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const newS = Math.max(0, Math.min(1, s + satDelta));
  const newL = Math.max(0, Math.min(1, l + lightDelta));
  const c = (1 - Math.abs(2 * newL - 1)) * newS;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = newL - c / 2;
  let r2 = 0;
  let g2 = 0;
  let b2 = 0;
  if (h < 60) { r2 = c; g2 = x; b2 = 0; }
  else if (h < 120) { r2 = x; g2 = c; b2 = 0; }
  else if (h < 180) { r2 = 0; g2 = c; b2 = x; }
  else if (h < 240) { r2 = 0; g2 = x; b2 = c; }
  else if (h < 300) { r2 = x; g2 = 0; b2 = c; }
  else { r2 = c; g2 = 0; b2 = x; }
  return rgbToHex((r2 + m) * 255, (g2 + m) * 255, (b2 + m) * 255);
}

function buildShorePath(points: Point[]): Path2D {
  const path = new Path2D();
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  path.moveTo((lastPoint.x + firstPoint.x) / 2, (lastPoint.y + firstPoint.y) / 2);
  points.forEach((point, index) => {
    const nextPoint = points[(index + 1) % points.length];
    path.quadraticCurveTo(point.x, point.y, (point.x + nextPoint.x) / 2, (point.y + nextPoint.y) / 2);
  });
  path.closePath();
  return path;
}

function addLandmass(centerX: number, centerY: number, width: number, height: number, pointsCount = 9, detailed = false) {
  const points: Point[] = [];
  const useDetailedShoreline = detailed && Math.random() < 0.68;
  for (let index = 0; index < pointsCount; index += 1) {
    const angle = index / pointsCount * Math.PI * 2;
    let radius = 0.72 + Math.random() * 0.4;
    if (useDetailedShoreline) {
      const notch = index % 3 === 0 && Math.random() < 0.65;
      const shelf = index % 4 === 1 && Math.random() < 0.55;
      if (notch) radius *= 0.34 + Math.random() * 0.2;
      else if (shelf) radius *= 0.52 + Math.random() * 0.18;
      else radius *= 0.88 + Math.random() * 0.28;
    }
    points.push({ x: centerX + Math.cos(angle) * width * radius, y: centerY + Math.sin(angle) * height * radius });
  }
  const isFarIsland = centerY < farForestThreshold;
  const satDelta = isFarIsland ? (Math.random() - 0.5) * 0.1 : 0;
  const lightDelta = isFarIsland ? (Math.random() - 0.5) * 0.06 : 0;
  const baseForestColor = isFarIsland ? shiftForestColor(forestColor, satDelta, lightDelta) : forestColor;
  const candidate: Landmass = { points, forestCircles: [], shorePath: buildShorePath(points), baseForestColor, rocks: [], mountainPeaks: [] };
  const bounds = landmassBounds(candidate);
  const circleCount = Math.min(180, 24 + Math.floor((width * height) / 2600));
  for (let circleIndex = 0; circleIndex < circleCount; circleIndex += 1) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const paletteColor = forestColors[Math.floor(Math.random() * forestColors.length)];
      const circle = {
        x: bounds.left + Math.random() * (bounds.right - bounds.left),
        y: bounds.top + Math.random() * (bounds.bottom - bounds.top),
        radius: (6 + Math.random() * 9) / 2,
        color: isFarIsland ? shiftForestColor(paletteColor, satDelta, lightDelta) : paletteColor,
      };
      if (pointInPolygon(circle, points)) {
        candidate.forestCircles.push(circle);
        break;
      }
    }
  }
  const candidateBounds = landmassBounds(candidate);
    if (!landmasses.some((landmass) => boundsOverlap(candidateBounds, landmassBounds(landmass), 8))) {
      landmasses.push(candidate);
      if (width <= 70 && Math.random() < 0.2) addOctopusNearIsland(centerX, centerY, width, height);
      if (Math.random() < 0.3) addTurtleNearIsland(candidate);
      if (width >= 150 && Math.random() < 0.4) addBuffaloHerd(candidate);
      if (width >= 150) addRockAndMountainFeatures(candidate, bounds);
    }
}

function addRockAndMountainFeatures(landmass: Landmass, bounds: ReturnType<typeof landmassBounds>) {
  const rockCount = 4 + Math.floor(Math.random() * 6);
  for (let index = 0; index < rockCount; index += 1) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const rock = {
        x: bounds.left + Math.random() * (bounds.right - bounds.left),
        y: bounds.top + Math.random() * (bounds.bottom - bounds.top),
        radius: 7 + Math.random() * 8,
        color: rockColors[Math.floor(Math.random() * rockColors.length)],
      };
      if (pointInPolygon(rock, landmass.points)) {
        landmass.rocks.push(rock);
        break;
      }
    }
  }

  if (Math.random() < 0.7) {
    let center: Point | null = null;
    for (let attempt = 0; attempt < 15 && !center; attempt += 1) {
      const candidatePoint = {
        x: bounds.left + Math.random() * (bounds.right - bounds.left),
        y: bounds.top + Math.random() * (bounds.bottom - bounds.top),
      };
      if (pointInPolygon(candidatePoint, landmass.points)) center = candidatePoint;
    }
    if (center) {
      const peakCount = 4 + Math.floor(Math.random() * 3);
      for (let index = 0; index < peakCount; index += 1) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 22;
        landmass.mountainPeaks.push({
          x: center.x + Math.cos(angle) * dist,
          y: center.y + Math.sin(angle) * dist,
          radius: 16 + Math.random() * 14,
          color: mountainColors[Math.floor(Math.random() * mountainColors.length)],
        });
      }
      landmass.mountainPeaks.push({
        x: center.x - 6,
        y: center.y - 8,
        radius: 8 + Math.random() * 6,
        color: mountainHighlight,
      });
    }
  }
}

function addBuffaloHerd(landmass: Landmass) {
  const bounds = landmassBounds(landmass);
  let clusterCenter: Point | null = null;
  for (let attempt = 0; attempt < 12 && !clusterCenter; attempt += 1) {
    const candidate = {
      x: bounds.left + Math.random() * (bounds.right - bounds.left),
      y: bounds.top + Math.random() * (bounds.bottom - bounds.top),
    };
    if (pointInPolygon(candidate, landmass.points)) clusterCenter = candidate;
  }
  if (!clusterCenter) return;
  const herdSize = 3 + Math.floor(Math.random() * 4);
  for (let index = 0; index < herdSize; index += 1) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const spot = {
        x: clusterCenter.x + (Math.random() - 0.5) * 70,
        y: clusterCenter.y + (Math.random() - 0.5) * 70,
      };
      if (pointInPolygon(spot, landmass.points)) {
        buffaloes.push({ x: spot.x, y: spot.y, phase: Math.random() * Math.PI * 2, heading: Math.random() * Math.PI * 2 });
        break;
      }
    }
  }
}

function landmassBounds(landmass: Landmass) {
  return landmass.points.reduce((bounds, point) => ({
    left: Math.min(bounds.left, point.x),
    right: Math.max(bounds.right, point.x),
    top: Math.min(bounds.top, point.y),
    bottom: Math.max(bounds.bottom, point.y),
  }), { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity });
}

function boundsOverlap(first: ReturnType<typeof landmassBounds>, second: ReturnType<typeof landmassBounds>, padding: number) {
  return first.left - padding < second.right && first.right + padding > second.left && first.top - padding < second.bottom && first.bottom + padding > second.top;
}

function buildShallowGroups() {
  const groups: Landmass[][] = [];
  for (const landmass of landmasses) {
    const touchingGroups = groups.filter((group) => group.some((member) => boundsOverlap(landmassBounds(landmass), landmassBounds(member), shallowWaterDistance)));
    if (touchingGroups.length === 0) groups.push([landmass]);
    else {
      const merged = [landmass, ...touchingGroups.flat()];
      touchingGroups.forEach((group) => groups.splice(groups.indexOf(group), 1));
      groups.push(merged);
    }
  }
  return groups;
}

function generateLand() {
  for (let chunk = -80; chunk < 3; chunk += 1) {
    const centerY = chunk * world.height / 2 + 100;

    if (chunk === 1) {
      addLandmass(170 + Math.random() * 110, centerY + 70, 24 + Math.random() * 18, 55 + Math.random() * 35, 7);
      addLandmass(960 + Math.random() * 100, centerY - 100, 28 + Math.random() * 20, 60 + Math.random() * 40, 7);
      addLandmass(320 + Math.random() * 100, centerY - 10, 18 + Math.random() * 15, 45 + Math.random() * 30, 7);
      continue;
    }
    if (chunk === 0) {
      addLandmass(160 + Math.random() * 170, centerY, 32 + Math.random() * 24, 75 + Math.random() * 45, 7);
      addLandmass(900 + Math.random() * 150, centerY + 120, 28 + Math.random() * 22, 70 + Math.random() * 40, 7);
      addLandmass(380 + Math.random() * 100, centerY - 140, 22 + Math.random() * 18, 55 + Math.random() * 35, 7);
      continue;
    }
    if (chunk === -1) {
      if (Math.random() < 0.5) addLandmass(180 + Math.random() * 820, centerY, 55 + Math.random() * 35, 130 + Math.random() * 70, 8);
      continue;
    }
    const terrainType = Math.random();

    if (terrainType < 0.12) continue;
    if (terrainType < 0.24) {
      addLandmass(160 + Math.random() * 880, centerY + (Math.random() - 0.5) * 160, 260 + Math.random() * 260, 650 + Math.random() * 400, 18 + Math.floor(Math.random() * 8), true);
      continue;
    }
    if (terrainType < 0.49) {
      const clusterCenter = 180 + Math.random() * 840;
      const islandCount = 5 + Math.floor(Math.random() * 6);
      for (let island = 0; island < islandCount; island += 1) {
        addLandmass(clusterCenter + (Math.random() - 0.5) * 420, centerY + (Math.random() - 0.5) * 300, 22 + Math.random() * 48, 28 + Math.random() * 72, 7);
      }
      continue;
    }
    if (terrainType < 0.72) {
      const channelWidth = 240 + Math.random() * 90;
      const leftRadius = 75 + Math.random() * 45;
      const rightRadius = 75 + Math.random() * 45;
      let channelCenter = 390 + Math.random() * 420;
      channelCenter = Math.max(320, Math.min(880, channelCenter + (Math.random() - 0.5) * 140));
        addLandmass(channelCenter - channelWidth / 2 - leftRadius, centerY, leftRadius, 360 + Math.random() * 140, 16 + Math.floor(Math.random() * 5), true);
        addLandmass(channelCenter + channelWidth / 2 + rightRadius, centerY, rightRadius, 360 + Math.random() * 140, 16 + Math.floor(Math.random() * 5), true);
      continue;
    }
    if (terrainType < 0.9) {
      const gap = 230 + Math.random() * 100;
      const leftRadius = 115 + Math.random() * 55;
      const rightRadius = 115 + Math.random() * 55;
      let channelCenter = 380 + Math.random() * 440;
      channelCenter = Math.max(300, Math.min(900, channelCenter + (Math.random() - 0.5) * 190));
        addLandmass(channelCenter - gap / 2 - leftRadius, centerY, leftRadius, 500 + Math.random() * 180, 18 + Math.floor(Math.random() * 5), true);
        addLandmass(channelCenter + gap / 2 + rightRadius, centerY, rightRadius, 500 + Math.random() * 180, 18 + Math.floor(Math.random() * 5), true);
      continue;
    }
    addLandmass(100 + Math.random() * 1000, centerY + (Math.random() - 0.5) * 140, 150 + Math.random() * 300, 340 + Math.random() * 480, 16 + Math.floor(Math.random() * 7), true);
  }

  const safeStart = { left: boat.x - 70, right: boat.x + 70, top: boat.y - 125, bottom: boat.y + 125 };
  const clearLand = landmasses.filter((landmass) => !landmass.points.some((point) => point.x > safeStart.left && point.x < safeStart.right && point.y > safeStart.top && point.y < safeStart.bottom));
  landmasses.splice(0, landmasses.length, ...clearLand);
}
generateLand();
const shallowGroups = buildShallowGroups();

function createMantaScenery(targetY = boat.y - 50 * 75) {
  const members: MantaMember[] = [];
  let areaCenter: Point | null = null;
  for (let attempt = 0; attempt < 80 && areaCenter === null; attempt += 1) {
    const candidate = { x: 260 + Math.random() * 680, y: targetY + (Math.random() - 0.5) * 420 };
    if (isDeepWater(candidate)) areaCenter = candidate;
  }
  if (areaCenter === null) return members;
  for (let index = 0; index < 18; index += 1) {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const member = {
        x: areaCenter.x + (Math.random() - 0.5) * 260,
        y: areaCenter.y + (Math.random() - 0.5) * 260,
        phase: Math.random() * Math.PI * 2,
        scale: 0.7 + Math.random() * 0.5,
      };
      if (isDeepWater(member)) {
        members.push(member);
        break;
      }
    }
  }
  return members;
}

mantaSchool = createMantaScenery();

function pointInPolygon(point: Point, polygon: Point[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const current = polygon[index];
    const prior = polygon[previous];
    if (current.y > point.y !== prior.y > point.y && point.x < ((prior.x - current.x) * (point.y - current.y)) / (prior.y - current.y) + current.x) inside = !inside;
  }
  return inside;
}

function isLand(point: Point) {
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  const land = landmasses.some((landmass) => context.isPointInPath(landmass.shorePath, point.x, point.y));
  context.restore();
  return land;
}

function pointToSegmentDistance(point: Point, start: Point, end: Point) {
  const directionX = end.x - start.x;
  const directionY = end.y - start.y;
  const lengthSquared = directionX * directionX + directionY * directionY;
  const progress = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - start.x) * directionX + (point.y - start.y) * directionY) / lengthSquared));
  return Math.hypot(point.x - (start.x + progress * directionX), point.y - (start.y + progress * directionY));
}

function distanceToLand(point: Point) {
  return Math.min(...landmasses.map((landmass) => Math.min(...landmass.points.map((current, index) => pointToSegmentDistance(point, current, landmass.points[(index + 1) % landmass.points.length])))));
}

function isDeepWater(point: Point) {
  return !isLand(point) && distanceToLand(point) > shallowWaterDistance;
}

function isLargeOpenWater(point: Point) {
  return !isLand(point) && distanceToLand(point) > 260;
}

function addOctopusNearIsland(centerX: number, centerY: number, width: number, height: number) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.max(width, height) * (0.72 + Math.random() * 0.18) + 8;
    const candidate = { x: centerX + Math.cos(angle) * distance, y: centerY + Math.sin(angle) * distance };
    if (!isLand(candidate)) {
      octopuses.push({ x: candidate.x, y: candidate.y, phase: Math.random() * Math.PI * 2, emergedUntil: 0 });
      return;
    }
  }
}

function addTurtleNearIsland(landmass: Landmass) {
  const bounds = landmassBounds(landmass);
  const center = { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const point = landmass.points[Math.floor(Math.random() * landmass.points.length)];
    const dirX = point.x - center.x;
    const dirY = point.y - center.y;
    const dirLen = Math.max(1, Math.hypot(dirX, dirY));
    const normX = dirX / dirLen;
    const normY = dirY / dirLen;
    const shoreSpot = { x: point.x - normX * 4, y: point.y - normY * 4 };
    const swimSpot = { x: point.x + normX * 30, y: point.y + normY * 30 };
    if (isLand(shoreSpot) && !isLand(swimSpot)) {
      turtles.push({
        shoreX: shoreSpot.x,
        shoreY: shoreSpot.y,
        swimX: swimSpot.x,
        swimY: swimSpot.y,
        heading: Math.atan2(shoreSpot.y - swimSpot.y, shoreSpot.x - swimSpot.x),
        swimSeed: Math.random() * 1000,
        size: 0.65 + Math.random() * 0.7,
        mode: Math.random() < 0.5 ? 'swim' : 'rest',
        modeElapsed: 0,
        swimDuration: 10000 + Math.random() * 16000,
        restDuration: 7000 + Math.random() * 14000,
      });
      return;
    }
  }
}

function findDeepWater(point: Point) {
  if (isDeepWater(point)) return point;
  for (let distance = 28; distance <= 260; distance += 28) {
    const candidates = [
      { x: point.x - distance, y: point.y },
      { x: point.x + distance, y: point.y },
      { x: point.x - distance, y: point.y - distance * 0.35 },
      { x: point.x + distance, y: point.y - distance * 0.35 },
    ];
    const openWater = candidates.find(isDeepWater);
    if (openWater) return openWater;
  }
  return null;
}

function initializeDolphinBay(targetY = boat.y - 30 * 75) {
  let center: Point | null = null;
  for (let attempt = 0; attempt < 80 && center === null; attempt += 1) {
    const candidate = { x: boat.x - 230 + (Math.random() - 0.5) * 260, y: targetY + (Math.random() - 0.5) * 360 };
    if (isDeepWater(candidate)) center = candidate;
  }
  if (center === null) center = findDeepWater({ x: boat.x - 230, y: targetY });
  if (!center) return;
  dolphinBayCenter = center;
  dolphinBay = Array.from({ length: 5 }, (_, index) => ({
    angle: index * Math.PI * 2 / 5 + Math.random() * 0.4,
    speed: 0.00035 + Math.random() * 0.00025,
    radius: 105 + Math.random() * 24,
    phase: Math.random() * Math.PI * 2,
  }));
  dolphinBayFish = Array.from({ length: 48 }, (_, index) => ({
    angle: index * Math.PI * 2 / 48 + Math.random() * 0.25,
    speed: 0.00055 + Math.random() * 0.0003,
    radius: 32 + Math.random() * 22,
    size: 4 + Math.random() * 4,
  }));
}

initializeDolphinBay();

function scheduleWildlifeScene() {
  const mapBoatY = boat.y - scroll;
  dolphinBayCenter = null;
  initializeDolphinBay(mapBoatY - (1750 + Math.random() * 1800));
  mantaSchool = createMantaScenery(mapBoatY - (3000 + Math.random() * 2500));
  wildlifeScene = dolphinBayCenter && mantaSchool.length > 0 ? { dolphinBay: dolphinBayCenter, mantaCenter: mantaSchool[0] } : null;
  dolphinPodElapsed = null;
  dolphinPodSeen = false;
}

function hasDolphinWaterCorridor() {
  const mapBoatY = boat.y - scroll;
  for (let sample = 0; sample <= 1; sample += 0.1) {
    const x = boat.x - 520 + sample * 420;
    const y = boat.y + 115 - sample * 115 + Math.sin(sample * Math.PI) * 85 - scroll;
    if (!isDeepWater({ x, y }) && sample > 0.25) return false;
  }
  return isDeepWater({ x: boat.x - 100, y: mapBoatY }) || isDeepWater({ x: boat.x + 100, y: mapBoatY });
}

function hasDolphinRoamingWater() {
  const mapBoatY = boat.y - scroll;
  return [boat.x - 380, boat.x - 300, boat.x - 220].some((x) => isDeepWater({ x, y: mapBoatY - 90 }));
}

function trySpawnFogPatch() {
  const mapBoatY = boat.y - scroll;
  const x = 100 + Math.random() * (world.width - 200);
  const y = mapBoatY - (700 + Math.random() * 1800);
  fogPatches.push({
    x,
    y,
    radius: 220 + Math.random() * 180,
    seed: Math.random() * 1000,
    driftAngle: Math.random() * Math.PI * 2,
    driftSpeed: 0.002 + Math.random() * 0.004,
  });
}

function updateFogPatches(delta: number) {
  fogCooldown -= delta;
  if (fogCooldown <= 0) {
    trySpawnFogPatch();
    fogCooldown = 26000 + Math.random() * 30000;
  }
  const mapBoatY = boat.y - scroll;
  for (let index = fogPatches.length - 1; index >= 0; index -= 1) {
    const fog = fogPatches[index];
    fog.x += Math.cos(fog.driftAngle) * fog.driftSpeed * delta;
    fog.y += Math.sin(fog.driftAngle) * fog.driftSpeed * delta;
    if (mapBoatY < fog.y - fog.radius - 600) {
      fogPatches.splice(index, 1);
    }
  }
}

function trySpawnWhirlpool() {
  const mapBoatY = boat.y - scroll;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const candidate = { x: 150 + Math.random() * (world.width - 300), y: mapBoatY - (600 + Math.random() * 1800) };
    if (isLargeOpenWater(candidate)) {
      whirlpools.push({ x: candidate.x, y: candidate.y, radius: 34 + Math.random() * 14, pullRadius: 150 + Math.random() * 40 });
      return;
    }
  }
}

function updateWhirlpools(delta: number) {
  if (survived >= 60000) {
    whirlpoolCooldown -= delta;
    if (whirlpoolCooldown <= 0) {
      trySpawnWhirlpool();
      whirlpoolCooldown = 14000 + Math.random() * 18000;
    }
  }
  const mapBoatY = boat.y - scroll;
  for (let index = whirlpools.length - 1; index >= 0; index -= 1) {
    const whirlpool = whirlpools[index];
    if (mapBoatY < whirlpool.y - 500) {
      whirlpools.splice(index, 1);
      continue;
    }
    const dx = boat.x - whirlpool.x;
    const dy = mapBoatY - whirlpool.y;
    const dist = Math.hypot(dx, dy);
    if (dist < whirlpool.pullRadius) {
      const pullStrength = (1 - dist / whirlpool.pullRadius) ** 2 * delta * 0.05;
      if (dist > 0.01) boat.x -= (dx / dist) * pullStrength;
    }
    if (dist < whirlpool.radius * 0.6 && !sinkingWhirlpool) {
      sinkingWhirlpool = whirlpool;
      sinkingElapsed = 0;
      sinkStartAngle = Math.atan2(dy, dx);
      sinkStartRadius = Math.max(6, dist);
    }
  }
  boat.x = Math.max(boat.width, Math.min(world.width - boat.width, boat.x));
}

function trySpawnWhalePod() {
  const mapBoatY = boat.y - scroll;
  const heading = -Math.PI / 2;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const candidate = { x: 150 + Math.random() * (world.width - 300), y: mapBoatY - (1000 + Math.random() * 1000) };
    if (!isDeepWater(candidate) || distanceToLand(candidate) <= 120) continue;
    const memberCount = 3 + Math.floor(Math.random() * 3);
    const now = performance.now();
    const members: WhaleMember[] = [];
    let allClear = true;
    for (let index = 0; index < memberCount; index += 1) {
      const along = index * 145 + (Math.random() - 0.5) * 20;
      const lateral = (Math.random() - 0.5) * 70;
      const memberSpot = { x: candidate.x + lateral, y: candidate.y + along };
      if (!isDeepWater(memberSpot)) {
        allClear = false;
        break;
      }
      members.push({
        x: memberSpot.x,
        y: memberSpot.y,
        heading,
        along,
        lateral,
        phase: Math.random() * Math.PI * 2,
        size: 0.72 + Math.random() * 0.5,
        nextBlowAt: now + 3000 + Math.random() * 14000,
        blowingUntil: 0,
      });
    }
    if (!allClear) continue;
    whalePods.push({
      x: candidate.x,
      y: candidate.y,
      heading,
      speed: 0.019 + (Math.random() - 0.5) * 0.002,
      members,
    });
    return;
  }
}

const whaleBlowDuration = 1300;

function whaleFormationTarget(pod: WhalePod, member: WhaleMember, time: number) {
  const forwardX = Math.cos(pod.heading);
  const forwardY = Math.sin(pod.heading);
  const lateralX = Math.cos(pod.heading + Math.PI / 2);
  const lateralY = Math.sin(pod.heading + Math.PI / 2);
  const lateralWobble = Math.sin(time * 0.0026 + member.phase) * 9;
  return {
    x: pod.x - forwardX * member.along + lateralX * (member.lateral + lateralWobble),
    y: pod.y - forwardY * member.along + lateralY * (member.lateral + lateralWobble),
  };
}

function updateWhaleMember(pod: WhalePod, member: WhaleMember, delta: number, time: number) {
  const target = whaleFormationTarget(pod, member, time);
  const smoothing = 1 - Math.exp(-delta / 450);
  member.x += (target.x - member.x) * smoothing;
  member.y += (target.y - member.y) * smoothing;
}

function updateWhalePods(delta: number) {
  if (survived >= 80000) {
    whalePodCooldown -= delta;
    if (whalePodCooldown <= 0) {
      trySpawnWhalePod();
      whalePodCooldown = 16000 + Math.random() * 20000;
    }
  }
  const mapBoatY = boat.y - scroll;
  const time = performance.now();
  for (let index = whalePods.length - 1; index >= 0; index -= 1) {
    const pod = whalePods[index];
    pod.x += Math.cos(pod.heading) * pod.speed * delta;
    pod.y += Math.sin(pod.heading) * pod.speed * delta;
    pod.x = Math.max(80, Math.min(world.width - 80, pod.x));
    if (mapBoatY < pod.y - 900) {
      whalePods.splice(index, 1);
      continue;
    }
    for (const member of pod.members) {
      if (time > member.nextBlowAt) {
        member.blowingUntil = time + whaleBlowDuration;
        member.nextBlowAt = time + 9000 + Math.random() * 18000;
      }
      updateWhaleMember(pod, member, delta, time);
      const dx = boat.x - member.x;
      const dy = mapBoatY - member.y;
      const dist = Math.hypot(dx, dy);
      const knockRadius = 60;
      if (dist < knockRadius && dist > 0.01) {
        const push = (1 - dist / knockRadius) * delta * 0.06;
        boat.x += (dx / dist) * push;
      }
    }
  }
  boat.x = Math.max(boat.width, Math.min(world.width - boat.width, boat.x));
}

function spawnFlock() {
  const width = canvas.clientWidth || world.width;
  const height = canvas.clientHeight || world.height;
  const fromLeft = Math.random() < 0.5;
  const y = 40 + Math.random() * (height - 80);
  const vx = (fromLeft ? 1 : -1) * (0.03 + Math.random() * 0.025);
  const count = Math.random() < 0.45 ? 1 : 2 + Math.floor(Math.random() * 4);
  const members: GullMember[] = Array.from({ length: count }, () => ({
    dx: (Math.random() - 0.5) * 60,
    dy: (Math.random() - 0.5) * 26,
    phase: Math.random() * Math.PI * 2,
  }));
  flocks.push({ x: fromLeft ? -60 : width + 60, y, vx, members });
}

function updateFlocks(delta: number) {
  flockCooldown -= delta;
  if (flockCooldown <= 0) {
    spawnFlock();
    flockCooldown = 9000 + Math.random() * 14000;
  }
  const width = canvas.clientWidth || world.width;
  for (let index = flocks.length - 1; index >= 0; index -= 1) {
    const flock = flocks[index];
    flock.x += flock.vx * delta;
    if (flock.x < -120 || flock.x > width + 120) flocks.splice(index, 1);
  }
}

const turtleTransitionDuration = 2200;

function updateTurtles(delta: number) {
  turtles.forEach((turtle) => {
    turtle.modeElapsed += delta;
    if (turtle.mode === 'swim' && turtle.modeElapsed > turtle.swimDuration) {
      turtle.mode = 'toShore';
      turtle.modeElapsed = 0;
    } else if (turtle.mode === 'toShore' && turtle.modeElapsed > turtleTransitionDuration) {
      turtle.mode = 'rest';
      turtle.modeElapsed = 0;
    } else if (turtle.mode === 'rest' && turtle.modeElapsed > turtle.restDuration) {
      turtle.mode = 'toSwim';
      turtle.modeElapsed = 0;
    } else if (turtle.mode === 'toSwim' && turtle.modeElapsed > turtleTransitionDuration) {
      turtle.mode = 'swim';
      turtle.modeElapsed = 0;
      turtle.swimDuration = 10000 + Math.random() * 16000;
      turtle.restDuration = 7000 + Math.random() * 14000;
    }
  });
}

function turtlePosition(turtle: Turtle, time: number) {
  const wobbleX = Math.sin(time * 0.0012 + turtle.swimSeed) * 9;
  const wobbleY = Math.cos(time * 0.0009 + turtle.swimSeed) * 5;
  if (turtle.mode === 'swim') {
    return { x: turtle.swimX + wobbleX, y: turtle.swimY + wobbleY, resting: false, heading: turtle.heading + Math.PI + Math.sin(time * 0.0015 + turtle.swimSeed) * 0.4 };
  }
  if (turtle.mode === 'rest') {
    return { x: turtle.shoreX, y: turtle.shoreY, resting: true, heading: turtle.heading };
  }
  const t = Math.min(1, turtle.modeElapsed / turtleTransitionDuration);
  const eased = t * t * (3 - 2 * t);
  if (turtle.mode === 'toShore') {
    return {
      x: turtle.swimX + (turtle.shoreX - turtle.swimX) * eased,
      y: turtle.swimY + (turtle.shoreY - turtle.swimY) * eased,
      resting: false,
      heading: turtle.heading,
    };
  }
  return {
    x: turtle.shoreX + (turtle.swimX - turtle.shoreX) * eased,
    y: turtle.shoreY + (turtle.swimY - turtle.shoreY) * eased,
    resting: false,
    heading: turtle.heading + Math.PI,
  };
}

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const bounds = canvas.getBoundingClientRect();
  if (bounds.width === 0 || bounds.height === 0) return;
  const targetWidth = Math.max(1, Math.round(bounds.width * ratio));
  const targetHeight = Math.max(1, Math.round(bounds.height * ratio));
  if (canvas.width === targetWidth && canvas.height === targetHeight) return;
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function resetVoyage() {
  boat.x = world.width / 2;
  scroll = 0;
  survived = 0;
  crashed = false;
  crashKind = null;
  started = false;
  startBanner.hidden = false;
  dolphinPodElapsed = null;
  dolphinPodSeen = false;
  wildlifeMinute = 1;
  fogPatches = [];
  fogCooldown = 6000 + Math.random() * 6000;
  whirlpools = [];
  whirlpoolCooldown = 5000;
  sinkingWhirlpool = null;
  sinkingElapsed = 0;
  whalePods = [];
  whalePodCooldown = 5000;
  turtleSlowUntil = 0;
  turtleSlowActive = false;
  statusElement.textContent = 'Ready';
  document.querySelector('.status-dot')?.classList.remove('status-dot--complete');
}

function update(delta: number) {
  if (!started || crashed) return;
  if (sinkingWhirlpool) {
    sinkingElapsed += delta;
    if (sinkingElapsed >= whirlpoolSinkDuration) {
      crashed = true;
      crashKind = 'whirlpool';
      statusElement.textContent = 'Sucked into a whirlpool - press space';
      sinkingWhirlpool = null;
    }
    return;
  }
  const speedMultiplier = survived < turtleSlowUntil ? 0.12 : 1;
  const steering = (keys.has('arrowright') ? 1 : 0) - (keys.has('arrowleft') ? 1 : 0);
  boat.x += steering * delta * 0.32 * speedMultiplier;
  boat.x = Math.max(boat.width, Math.min(world.width - boat.width, boat.x));
  scroll += delta * 0.075 * speedMultiplier;
  survived += delta;
  if (survived >= wildlifeMinute * 60000) {
    scheduleWildlifeScene();
    wildlifeMinute += 1;
  }
  if (dolphinPodElapsed !== null) {
    dolphinPodElapsed += delta;
    if (dolphinPodElapsed >= 9000) dolphinPodElapsed = null;
  }
  if (dolphinPodElapsed === null && !dolphinPodSeen && dolphinBayCenter && Math.hypot(boat.x - dolphinBayCenter.x, boat.y - scroll - dolphinBayCenter.y) < 330) {
    dolphinPodElapsed = 0;
    dolphinPodSeen = true;
  }
  const boatMapPosition = { x: boat.x, y: boat.y - scroll };
  turtles.forEach((turtle) => {
    const position = turtlePosition(turtle, performance.now());
    const hitRadius = 26 + turtle.size * 16;
    if (Math.hypot(boatMapPosition.x - position.x, boatMapPosition.y - position.y) < hitRadius) {
      turtleSlowUntil = survived + 10000;
    }
  });
  const turtleSlowedNow = survived < turtleSlowUntil;
  if (turtleSlowedNow && !turtleSlowActive) {
    turtleSlowActive = true;
    statusElement.textContent = 'Tangled with a turtle - slowed!';
  } else if (!turtleSlowedNow && turtleSlowActive) {
    turtleSlowActive = false;
    statusElement.textContent = 'Underway';
  }
  octopuses.forEach((octopus) => {
    if (octopus.emergedUntil !== 0) return;
    const bodyContact = Math.hypot(boatMapPosition.x - octopus.x, boatMapPosition.y - octopus.y) < 50;
    const tentacleContact = bodyContact ? false : octopusTentacles(octopus, octopusBody(octopus), performance.now() * 0.001).some(
      (tentacle) => pointToSegmentDistance(boatMapPosition, tentacle.base, tentacle.control) < 24
        || pointToSegmentDistance(boatMapPosition, tentacle.control, tentacle.tip) < 24,
    );
    if (bodyContact || tentacleContact) octopus.emergedUntil = survived + 5500;
  });

  updateWhirlpools(delta);
  updateWhalePods(delta);
  updateTurtles(delta);
  updateFogPatches(delta);

  const mapY = boat.y - scroll;
  const collisionPoints = [
    { x: boat.x, y: mapY },
    { x: boat.x - boat.width / 2, y: mapY + boat.height / 3 },
    { x: boat.x + boat.width / 2, y: mapY + boat.height / 3 },
  ];
  if (collisionPoints.some(isLand)) {
    crashed = true;
    crashKind = 'land';
    statusElement.textContent = 'Crash - press space';
  }
}

function traceLandmass(landmass: Landmass, yOffset: number, scale: number) {
  context.beginPath();
  const firstPoint = landmass.points[0];
  const lastPoint = landmass.points[landmass.points.length - 1];
  const startX = (lastPoint.x + firstPoint.x) / 2 * scale;
  const startY = (lastPoint.y + firstPoint.y + yOffset * 2) / 2 * scale;
  context.moveTo(startX, startY);
  landmass.points.forEach((point, index) => {
    const nextPoint = landmass.points[(index + 1) % landmass.points.length];
    const midpointX = (point.x + nextPoint.x) / 2 * scale;
    const midpointY = (point.y + nextPoint.y + yOffset * 2) / 2 * scale;
    context.quadraticCurveTo((point.x) * scale, (point.y + yOffset) * scale, midpointX, midpointY);
  });
  context.closePath();
}

function traceWaterOffset(landmass: Landmass, yOffset: number, scale: number, offset: number, variation: number) {
  const center = landmass.points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
  center.x /= landmass.points.length;
  center.y /= landmass.points.length;
  const points = landmass.points.map((point, index) => {
    const directionX = point.x - center.x;
    const directionY = point.y - center.y;
    const length = Math.max(1, Math.hypot(directionX, directionY));
    const jitter = Math.sin(index * 9.17 + center.x * 0.013 + center.y * 0.007) * variation;
    const distance = offset + jitter;
    return { x: point.x + directionX / length * distance, y: point.y + directionY / length * distance };
  });
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  context.moveTo((lastPoint.x + firstPoint.x) / 2 * scale, (lastPoint.y + firstPoint.y + yOffset * 2) / 2 * scale);
  points.forEach((point, index) => {
    const nextPoint = points[(index + 1) % points.length];
    context.quadraticCurveTo(point.x * scale, (point.y + yOffset) * scale, (point.x + nextPoint.x) / 2 * scale, (point.y + nextPoint.y + yOffset * 2) / 2 * scale);
  });
  context.closePath();
}

function drawLandmass(landmass: Landmass, yOffset: number, scale: number, showShoreline = true) {
  traceLandmass(landmass, yOffset, scale);
  context.fillStyle = '#050607';
  context.fill();
  if (!showShoreline) return;
  context.save();
  context.clip();
  context.fillStyle = landmass.baseForestColor;
  context.fill();
  for (const circle of landmass.forestCircles) {
    context.beginPath();
    context.arc(circle.x * scale, (circle.y + yOffset) * scale, circle.radius * scale, 0, Math.PI * 2);
    context.fillStyle = circle.color;
    context.fill();
  }
  for (const rock of landmass.rocks) {
    context.beginPath();
    context.arc(rock.x * scale, (rock.y + yOffset) * scale, rock.radius * scale, 0, Math.PI * 2);
    context.fillStyle = rock.color;
    context.fill();
  }
  for (const peak of landmass.mountainPeaks) {
    context.beginPath();
    context.arc(peak.x * scale, (peak.y + yOffset) * scale, peak.radius * scale, 0, Math.PI * 2);
    context.fillStyle = peak.color;
    context.fill();
  }
  traceLandmass(landmass, yOffset, scale);
  context.strokeStyle = grassColor;
  context.lineWidth = (shorelineWidth + cliffedgeWidth + grassWidth) * 2;
  context.stroke();
  context.strokeStyle = cliffedgeColor;
  context.lineWidth = (shorelineWidth + cliffedgeWidth) * 2;
  context.stroke();
  context.strokeStyle = shorelineColor;
  context.lineWidth = shorelineWidth * 2;
  context.stroke();
  context.restore();
}

function drawShallowGroups(yOffset: number, scale: number) {
  context.beginPath();
  for (const group of shallowGroups) {
    for (const landmass of group) traceWaterOffset(landmass, yOffset, scale, shallowWaterDistance, 18);
  }
  context.fillStyle = shallowsColor;
  context.fill();
}

function drawChartGrid(yOffset: number, scale: number) {
  context.save();
  context.fillStyle = 'rgba(255, 255, 255, 0.34)';
  const dotSize = Math.max(1, 1.4 * scale);
  const horizontalOffset = ((yOffset % gridSpacing) + gridSpacing) % gridSpacing;
  for (let x = 0; x <= world.width; x += gridSpacing) {
    for (let y = -gridSpacing + horizontalOffset; y <= world.height; y += gridSpacing) {
      context.beginPath();
      context.arc(x * scale, y * scale, dotSize, 0, Math.PI * 2);
      context.fill();
    }
  }
  for (let y = -gridSpacing + horizontalOffset; y <= world.height; y += gridSpacing) {
    for (let x = 0; x <= world.width; x += gridSpacing) {
      context.beginPath();
      context.arc(x * scale, y * scale, dotSize, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.restore();
}

function drawDolphin(x: number, y: number, scale: number, phase: number, orientation: number) {
  context.save();
  context.translate(x * scale, y * scale);
  context.rotate(orientation + Math.sin(phase) * 0.06);
  context.fillStyle = '#315e70';
  context.beginPath();
  context.moveTo(0, -29 * scale);
  context.quadraticCurveTo(4 * scale, -27 * scale, 7 * scale, -18 * scale);
  context.quadraticCurveTo(9 * scale, -5 * scale, 7 * scale, 9 * scale);
  context.quadraticCurveTo(5 * scale, 20 * scale, 2 * scale, 25 * scale);
  context.quadraticCurveTo(0, 28 * scale, -2 * scale, 25 * scale);
  context.quadraticCurveTo(-5 * scale, 20 * scale, -7 * scale, 9 * scale);
  context.quadraticCurveTo(-9 * scale, -5 * scale, -7 * scale, -18 * scale);
  context.quadraticCurveTo(-4 * scale, -27 * scale, 0, -29 * scale);
  context.closePath();
  context.fill();

  context.fillStyle = '#23495a';
  context.beginPath();
  context.moveTo(-5 * scale, 4 * scale);
  context.quadraticCurveTo(-14 * scale, 5 * scale, -22 * scale, 15 * scale);
  context.quadraticCurveTo(-16 * scale, 17 * scale, -9 * scale, 13 * scale);
  context.quadraticCurveTo(-5 * scale, 10 * scale, -3 * scale, 7 * scale);
  context.closePath();
  context.fill();
  context.beginPath();
  context.moveTo(5 * scale, 4 * scale);
  context.quadraticCurveTo(14 * scale, 5 * scale, 22 * scale, 15 * scale);
  context.quadraticCurveTo(16 * scale, 17 * scale, 9 * scale, 13 * scale);
  context.quadraticCurveTo(5 * scale, 10 * scale, 3 * scale, 7 * scale);
  context.closePath();
  context.fill();

  context.fillStyle = '#477b8a';
  context.beginPath();
  context.moveTo(-3 * scale, 23 * scale);
  context.quadraticCurveTo(-8 * scale, 27 * scale, -17 * scale, 34 * scale);
  context.quadraticCurveTo(-9 * scale, 35 * scale, -1 * scale, 30 * scale);
  context.quadraticCurveTo(0, 28 * scale, 1 * scale, 30 * scale);
  context.quadraticCurveTo(9 * scale, 35 * scale, 17 * scale, 34 * scale);
  context.quadraticCurveTo(8 * scale, 27 * scale, 3 * scale, 23 * scale);
  context.closePath();
  context.fill();

  context.fillStyle = '#1f4353';
  context.beginPath();
  context.moveTo(0, -2 * scale);
  context.quadraticCurveTo(7 * scale, -5 * scale, 8 * scale, 4 * scale);
  context.lineTo(4 * scale, 12 * scale);
  context.lineTo(0, 5 * scale);
  context.lineTo(-4 * scale, 12 * scale);
  context.quadraticCurveTo(-8 * scale, 4 * scale, -8 * scale, -2 * scale);
  context.closePath();
  context.fill();
  context.restore();
}

function drawDolphinPod(scale: number) {
  if (dolphinBayCenter === null) return;
  const elapsed = performance.now();
  const now = performance.now();
  const centerX = dolphinBayCenter.x;
  const centerY = dolphinBayCenter.y + scroll;
  const bayTime = dolphinPodElapsed ?? 0;

  dolphinBayFish.forEach((fish) => {
    const angle = fish.angle + now * fish.speed;
    const fishX = centerX + Math.cos(angle) * fish.radius;
    const fishY = centerY + Math.sin(angle) * fish.radius * 0.65;
    if (isDeepWater({ x: fishX, y: fishY - scroll })) {
      context.fillStyle = '#e98d3a';
      context.beginPath();
      context.ellipse(fishX * scale, fishY * scale, fish.size * scale, fish.size * 0.55 * scale, angle + Math.PI / 2, 0, Math.PI * 2);
      context.fill();
    }
  });

  dolphinBay.forEach((dolphin, index) => {
    const orbitAngle = dolphin.angle + now * dolphin.speed;
    let dolphinX = centerX + Math.cos(orbitAngle) * dolphin.radius;
    let dolphinY = centerY + Math.sin(orbitAngle) * dolphin.radius * 0.65;
    let orientation = orbitAngle + Math.PI;
    if (dolphinPodElapsed !== null && index === 0) {
      const visitProgress = Math.min(1, bayTime / 3500);
      const returnProgress = Math.min(1, Math.max(0, (bayTime - 3500) / 3500));
      const startX = centerX + Math.cos(orbitAngle) * dolphin.radius;
      const startY = centerY + Math.sin(orbitAngle) * dolphin.radius * 0.65;
      const targetX = boat.x - 62;
      const targetY = boat.y + 8;
      if (bayTime < 3500) {
        const eased = visitProgress * visitProgress * (3 - 2 * visitProgress);
        dolphinX = startX + (targetX - startX) * eased;
        dolphinY = startY + (targetY - startY) * eased;
        orientation = Math.atan2(targetY - startY, targetX - startX) + Math.PI / 2;
      } else if (bayTime < 7000) {
        const eased = returnProgress * returnProgress * (3 - 2 * returnProgress);
        const returnX = centerX + Math.cos(orbitAngle) * dolphin.radius;
        const returnY = centerY + Math.sin(orbitAngle) * dolphin.radius * 0.65;
        dolphinX = targetX + (returnX - targetX) * eased;
        dolphinY = targetY + (returnY - targetY) * eased;
        orientation = Math.atan2(returnY - targetY, returnX - targetX) + Math.PI / 2;
      }
    }
    if (isDeepWater({ x: dolphinX, y: dolphinY - scroll })) drawDolphin(dolphinX, dolphinY, scale, now * 0.004 + index, orientation);
  });
}

function drawManta(x: number, y: number, scale: number, size: number, phase: number) {
  context.save();
  context.translate(x * scale, y * scale);
  const wingFlap = Math.sin(phase) * 4 * size;
  context.rotate(Math.sin(phase) * 0.05);
  context.fillStyle = '#527f91';
  context.beginPath();
  context.moveTo(0, -18 * size * scale);
  context.quadraticCurveTo(-15 * size * scale, (-15 + wingFlap) * scale, -34 * size * scale, (-5 + wingFlap) * scale);
  context.quadraticCurveTo(-27 * size * scale, (7 + wingFlap) * scale, -9 * size * scale, 9 * size * scale);
  context.quadraticCurveTo(-4 * size * scale, 18 * size * scale, 0, 25 * size * scale);
  context.quadraticCurveTo(4 * size * scale, 18 * size * scale, 9 * size * scale, 9 * size * scale);
  context.quadraticCurveTo(27 * size * scale, (7 - wingFlap) * scale, 34 * size * scale, (-5 - wingFlap) * scale);
  context.quadraticCurveTo(15 * size * scale, (-15 - wingFlap) * scale, 0, -18 * size * scale);
  context.closePath();
  context.fill();
  context.strokeStyle = 'rgba(191, 224, 226, .45)';
  context.lineWidth = Math.max(1, scale);
  context.beginPath();
  context.moveTo(0, -9 * size * scale);
  context.lineTo(0, 19 * size * scale);
  context.stroke();
  context.restore();
}

function drawMantaSchool(scale: number) {
  mantaSchool.forEach((member, index) => {
    const screenY = member.y + scroll;
    if (screenY > -80 && screenY < world.height + 80 && isDeepWater(member)) {
      const driftX = Math.sin(performance.now() * 0.00045 + member.phase) * 12;
      const driftY = Math.cos(performance.now() * 0.00035 + member.phase) * 8;
      drawManta(member.x + driftX, screenY + driftY, scale, member.scale, performance.now() * 0.001 + index);
    }
  });
}

function octopusBody(octopus: Octopus) {
  const emerged = octopus.emergedUntil > survived;
  const emergenceStart = octopus.emergedUntil - 5500;
  const emergenceElapsed = Math.max(0, survived - emergenceStart);
  const approachProgress = Math.min(1, emergenceElapsed / 1400);
  const retreatProgress = Math.min(1, Math.max(0, (emergenceElapsed - 3600) / 1900));
  const movement = retreatProgress > 0 ? 1 - retreatProgress : approachProgress;
  return {
    x: octopus.x + (boat.x - octopus.x) * movement,
    y: octopus.y + (boat.y - scroll - octopus.y) * movement,
    emerged,
  };
}

function octopusTentacles(octopus: Octopus, body: { x: number; y: number; emerged: boolean }, time: number) {
  const visibleTentacles = body.emerged ? 8 : 1 + Math.floor((Math.sin(octopus.phase) + 1) * 0.5);
  const tentacles: { base: Point; control: Point; tip: Point }[] = [];
  for (let tentacle = 0; tentacle < visibleTentacles; tentacle += 1) {
    const angle = tentacle * Math.PI / 4 + Math.sin(time * 0.8 + octopus.phase + tentacle) * 0.12;
    const curl = (Math.sin(time * 1.5 + octopus.phase + tentacle * 0.9) + 1) / 2;
    const length = body.emerged ? 128 + curl * 36 : 84 + curl * 18;
    const sway = Math.sin(time * 1.5 + octopus.phase + tentacle * 0.9) * (body.emerged ? 30 : 18);
    const bend = Math.sin(time * 1.5 + octopus.phase + tentacle * 0.9) * (body.emerged ? 44 : 24);
    const endX = Math.cos(angle) * length + Math.cos(angle + Math.PI / 2) * sway;
    const endY = Math.sin(angle) * length + Math.sin(angle + Math.PI / 2) * sway;
    const midAngle = angle + Math.sin(time * 1.5 + tentacle) * 0.28;
    const controlX = Math.cos(midAngle) * (length * 0.52) + Math.cos(angle + Math.PI / 2) * bend;
    const controlY = Math.sin(midAngle) * (length * 0.52) + Math.sin(angle + Math.PI / 2) * bend;
    tentacles.push({
      base: { x: body.x, y: body.y },
      control: { x: body.x + controlX, y: body.y + controlY },
      tip: { x: body.x + endX, y: body.y + endY },
    });
  }
  return tentacles;
}

function drawOctopus(octopus: Octopus, scale: number) {
  const screenY = octopus.y + scroll;
  if (screenY < -120 || screenY > world.height + 120 || isLand({ x: octopus.x, y: octopus.y })) return;
  const time = performance.now() * 0.001;
  const body = octopusBody(octopus);
  context.save();
  context.translate(body.x * scale, (body.y + scroll) * scale);
  context.strokeStyle = body.emerged ? '#07192e' : 'rgba(7, 25, 46, .8)';
  context.lineWidth = (body.emerged ? 7 : 4) * scale;
  context.lineCap = 'round';
  const tentacles = octopusTentacles(octopus, body, time);
  tentacles.forEach((tentacle) => {
    context.beginPath();
    context.moveTo(0, 0);
    context.quadraticCurveTo(
      (tentacle.control.x - body.x) * scale,
      (tentacle.control.y - body.y) * scale,
      (tentacle.tip.x - body.x) * scale,
      (tentacle.tip.y - body.y) * scale,
    );
    context.stroke();
  });
  if (body.emerged) {
    context.fillStyle = '#0a2340';
    context.beginPath();
    context.ellipse(0, -2 * scale, 19 * scale, 24 * scale, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#12375d';
    context.beginPath();
    context.ellipse(-6 * scale, -8 * scale, 8 * scale, 10 * scale, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#f3eee0';
    context.fillRect(-12 * scale, -16 * scale, 7 * scale, 9 * scale);
    context.fillRect(5 * scale, -16 * scale, 7 * scale, 9 * scale);
    context.fillStyle = '#050607';
    context.fillRect(-10 * scale, -14 * scale, 3 * scale, 5 * scale);
    context.fillRect(7 * scale, -14 * scale, 3 * scale, 5 * scale);
  }
  context.restore();
}

function drawOctopuses(scale: number) {
  octopuses.forEach((octopus) => drawOctopus(octopus, scale));
}

function drawTurtle(x: number, y: number, scale: number, time: number, turtle: Turtle, resting: boolean, heading: number) {
  context.save();
  context.translate(x * scale, y * scale);
  context.rotate(heading + Math.PI / 2);
  const paddle = resting ? 0 : Math.sin(time * 0.006 + turtle.swimSeed);

  context.fillStyle = 'rgba(0, 0, 0, .15)';
  context.beginPath();
  context.ellipse(1 * scale, 1 * scale, 8 * scale, 9.5 * scale, 0, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = '#3d5c33';
  context.beginPath();
  context.ellipse(0, 0, 7.5 * scale, 9.5 * scale, 0, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = '#5b7d45';
  context.beginPath();
  context.ellipse(0, -0.5 * scale, 5 * scale, 6.8 * scale, 0, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = 'rgba(61, 92, 51, .6)';
  context.lineWidth = 0.8 * scale;
  context.beginPath();
  context.moveTo(0, -6 * scale);
  context.lineTo(0, 6 * scale);
  context.moveTo(-3 * scale, -2 * scale);
  context.lineTo(3 * scale, -2 * scale);
  context.moveTo(-3.5 * scale, 2 * scale);
  context.lineTo(3.5 * scale, 2 * scale);
  context.stroke();

  context.fillStyle = '#4c6b3a';
  context.beginPath();
  context.ellipse(0, -10 * scale, 2.4 * scale, 3 * scale, 0, 0, Math.PI * 2);
  context.fill();

  [-1, 1].forEach((side) => {
    context.save();
    context.translate(side * 7 * scale, -3.5 * scale);
    context.rotate(side * (0.5 + paddle * 0.35));
    context.beginPath();
    context.ellipse(0, 0, 2 * scale, 4.6 * scale, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  });

  [-1, 1].forEach((side) => {
    context.save();
    context.translate(side * 6 * scale, 7 * scale);
    context.rotate(side * (0.4 - paddle * 0.25));
    context.beginPath();
    context.ellipse(0, 0, 1.7 * scale, 3.2 * scale, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  });

  context.restore();
}

function drawTurtles(scale: number) {
  const time = performance.now();
  turtles.forEach((turtle) => {
    const position = turtlePosition(turtle, time);
    const screenY = position.y + scroll;
    if (screenY < -60 || screenY > world.height + 60) return;
    drawTurtle(position.x, screenY, scale * turtle.size, time, turtle, position.resting, position.heading);
  });
}

function drawBuffalo(x: number, y: number, scale: number, time: number, buffalo: Buffalo) {
  context.save();
  context.translate(x * scale, y * scale);
  context.rotate(buffalo.heading);
  const graze = (Math.sin(time * 0.0006 + buffalo.phase) + 1) / 2;
  const headDip = graze * 2.2;

  context.fillStyle = 'rgba(0, 0, 0, .18)';
  context.beginPath();
  context.ellipse(0.5 * scale, 0.5 * scale, 7 * scale, 5 * scale, 0, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = '#4a3423';
  context.beginPath();
  context.ellipse(0, 0, 6.5 * scale, 4.6 * scale, 0, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = '#3a2919';
  context.beginPath();
  context.ellipse(0, (-5.5 + headDip) * scale, 3.2 * scale, 2.6 * scale, 0, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = '#2a1c10';
  context.lineWidth = 1 * scale;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(-2.2 * scale, (-7 + headDip) * scale);
  context.lineTo(-3.6 * scale, (-8.6 + headDip) * scale);
  context.moveTo(2.2 * scale, (-7 + headDip) * scale);
  context.lineTo(3.6 * scale, (-8.6 + headDip) * scale);
  context.stroke();

  context.restore();
}

function drawBuffaloes(scale: number) {
  const time = performance.now();
  buffaloes.forEach((buffalo) => {
    const screenY = buffalo.y + scroll;
    if (screenY < -40 || screenY > world.height + 40) return;
    drawBuffalo(buffalo.x, screenY, scale, time, buffalo);
  });
}

function drawWhirlpool(whirlpool: Whirlpool, scale: number) {
  const screenY = whirlpool.y + scroll;
  if (screenY < -200 || screenY > world.height + 200) return;
  const time = performance.now() * 0.001;
  context.save();
  context.translate(whirlpool.x * scale, screenY * scale);
  for (let ring = 0; ring < 5; ring += 1) {
    const ringRadius = whirlpool.radius * (1 - ring * 0.18);
    context.save();
    context.rotate(time * (1.4 + ring * 0.3) + ring);
    context.strokeStyle = `rgba(10, 30, 45, ${0.5 - ring * 0.07})`;
    context.lineWidth = 3 * scale;
    context.beginPath();
    context.arc(0, 0, ringRadius * scale, 0.3, Math.PI * 1.5);
    context.stroke();
    context.restore();
  }
  context.fillStyle = 'rgba(4, 14, 22, .85)';
  context.beginPath();
  context.arc(0, 0, whirlpool.radius * 0.22 * scale, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawWhirlpools(scale: number) {
  whirlpools.forEach((whirlpool) => drawWhirlpool(whirlpool, scale));
}

function drawFogPatch(fog: FogPatch, scale: number, time: number) {
  const screenY = fog.y + scroll;
  if (screenY < -fog.radius - 100 || screenY > world.height + fog.radius + 100) return;
  const blobCount = 5;
  context.beginPath();
  for (let index = 0; index < blobCount; index += 1) {
    const angle = (index / blobCount) * Math.PI * 2 + fog.seed;
    const wobble = Math.sin(time * 0.00012 + fog.seed + index) * 0.12;
    const offsetX = Math.cos(angle) * fog.radius * 0.34;
    const offsetY = Math.sin(angle) * fog.radius * 0.34;
    const blobRadius = fog.radius * (0.5 + wobble + (index % 2) * 0.12);
    context.moveTo((fog.x + offsetX + blobRadius) * scale, (screenY + offsetY) * scale);
    context.arc((fog.x + offsetX) * scale, (screenY + offsetY) * scale, blobRadius * scale, 0, Math.PI * 2);
  }
  context.fillStyle = 'rgba(235, 242, 245, 0.5)';
  context.fill();
}

function drawFogPatches(scale: number) {
  const time = performance.now();
  fogPatches.forEach((fog) => drawFogPatch(fog, scale, time));
}

function drawWhale(x: number, y: number, scale: number, phase: number, heading: number, blowProgress: number | null) {
  context.save();
  context.translate(x * scale, y * scale);
  context.rotate(heading + Math.PI / 2);

  context.fillStyle = '#1b333d';
  [-1, 1].forEach((side) => {
    context.beginPath();
    context.moveTo(side * 8 * scale, -28 * scale);
    context.quadraticCurveTo(side * 20 * scale, -26 * scale, side * 23 * scale, -16 * scale);
    context.quadraticCurveTo(side * 14 * scale, -18 * scale, side * 7 * scale, -14 * scale);
    context.closePath();
    context.fill();
  });

  context.beginPath();
  context.moveTo(0, -60 * scale);
  context.quadraticCurveTo(9 * scale, -50 * scale, 10 * scale, -30 * scale);
  context.quadraticCurveTo(11 * scale, -10 * scale, 10 * scale, 10 * scale);
  context.quadraticCurveTo(9 * scale, 26 * scale, 5 * scale, 36 * scale);
  context.quadraticCurveTo(3 * scale, 40 * scale, 0, 42 * scale);
  context.quadraticCurveTo(-3 * scale, 40 * scale, -5 * scale, 36 * scale);
  context.quadraticCurveTo(-9 * scale, 26 * scale, -10 * scale, 10 * scale);
  context.quadraticCurveTo(-11 * scale, -10 * scale, -10 * scale, -30 * scale);
  context.quadraticCurveTo(-9 * scale, -50 * scale, 0, -60 * scale);
  context.closePath();
  context.fill();

  const strokeCycle = (Math.sin(phase * 2.4) + 1) / 2;
  const flukeDark = [27, 51, 61];
  const flukeLight = [70, 108, 122];
  const flukeR = Math.round(flukeDark[0] + (flukeLight[0] - flukeDark[0]) * strokeCycle);
  const flukeG = Math.round(flukeDark[1] + (flukeLight[1] - flukeDark[1]) * strokeCycle);
  const flukeB = Math.round(flukeDark[2] + (flukeLight[2] - flukeDark[2]) * strokeCycle);
  context.fillStyle = `rgb(${flukeR}, ${flukeG}, ${flukeB})`;
  context.beginPath();
  context.moveTo(-4 * scale, 34 * scale);
  context.quadraticCurveTo(-16 * scale, 44 * scale, -21 * scale, 58 * scale);
  context.quadraticCurveTo(-9 * scale, 52 * scale, 0, 43 * scale);
  context.quadraticCurveTo(9 * scale, 52 * scale, 21 * scale, 58 * scale);
  context.quadraticCurveTo(16 * scale, 44 * scale, 4 * scale, 34 * scale);
  context.closePath();
  context.fill();

  context.fillStyle = '#122129';
  context.beginPath();
  context.moveTo(5 * scale, 14 * scale);
  context.lineTo(12 * scale, 20 * scale);
  context.lineTo(6 * scale, 24 * scale);
  context.closePath();
  context.fill();

  context.fillStyle = 'rgba(233, 246, 245, .92)';
  const tips: [number, number, number][] = [
    [22, -17, -0.5],
    [-22, -17, 0.5],
  ];
  tips.forEach(([tx, ty, rot]) => {
    context.save();
    context.translate(tx * scale, ty * scale);
    context.rotate(rot);
    context.beginPath();
    context.ellipse(0, 0, 5 * scale, 2.1 * scale, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  });

  context.fillStyle = 'rgba(10, 20, 24, .5)';
  [[-3, -52], [3, -54], [-1, -48], [5, -49]].forEach(([tx, ty]) => {
    context.beginPath();
    context.arc(tx * scale, ty * scale, 1.2 * scale, 0, Math.PI * 2);
    context.fill();
  });

  if (blowProgress !== null) {
    const blowholeX = 0;
    const blowholeY = -21;
    const windX = 9;
    const windY = -11;
    [0, 0.3, 0.6].forEach((delay) => {
      const t = blowProgress - delay;
      if (t <= 0) return;
      const local = Math.min(1, t / (1 - delay));
      const alpha = (1 - local) * 0.75;
      if (alpha <= 0) return;
      const px = blowholeX + windX * local;
      const py = blowholeY + windY * local;
      const radius = (2.5 + local * 8) * scale;
      context.fillStyle = `rgba(240, 248, 250, ${alpha})`;
      context.beginPath();
      context.arc(px * scale, py * scale, radius, 0, Math.PI * 2);
      context.fill();
    });
  }

  context.restore();
}

const whaleFadeMargin = 150;

function drawWhalePods(scale: number) {
  const now = performance.now();
  whalePods.forEach((pod) => {
    pod.members.forEach((member) => {
      const screenY = member.y + scroll;
      const fade = Math.max(0, Math.min(
        (screenY + whaleFadeMargin) / whaleFadeMargin,
        (world.height + whaleFadeMargin - screenY) / whaleFadeMargin,
        1,
      ));
      if (fade > 0 && !isLand({ x: member.x, y: member.y }) && distanceToLand({ x: member.x, y: member.y }) > 85) {
        const blowProgress = now < member.blowingUntil ? 1 - (member.blowingUntil - now) / whaleBlowDuration : null;
        context.save();
        context.globalAlpha = fade;
        drawWhale(member.x, screenY, scale * member.size, now * 0.0015 + member.phase, member.heading, blowProgress);
        context.restore();
      }
    });
  });
}

function drawGull(x: number, y: number, phase: number, facingRight: boolean) {
  const flap = Math.sin(phase) * 5;
  context.save();
  context.translate(x, y);
  if (!facingRight) context.scale(-1, 1);
  context.strokeStyle = 'rgba(60, 60, 65, .8)';
  context.lineWidth = 2;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(-9, 0);
  context.quadraticCurveTo(-4, -6 - flap, 0, 0);
  context.quadraticCurveTo(4, -6 - flap, 9, 0);
  context.stroke();
  context.restore();
}

function drawFlocks() {
  const now = performance.now();
  flocks.forEach((flock) => {
    flock.members.forEach((member) => {
      drawGull(flock.x + member.dx, flock.y + member.dy, now * 0.006 + member.phase, flock.vx > 0);
    });
  });
}

function drawShipwreck(scale: number) {
  context.strokeStyle = 'rgba(220, 240, 245, .55)';
  context.lineWidth = 2 * scale;
  context.lineCap = 'round';
  [-30, 2, 30].forEach((wx) => {
    context.beginPath();
    context.moveTo((wx - 11) * scale, 40 * scale);
    context.quadraticCurveTo(wx * scale, 32 * scale, (wx + 11) * scale, 40 * scale);
    context.stroke();
  });

  context.save();
  context.rotate(0.4);

  context.fillStyle = '#3a2013';
  context.beginPath();
  context.moveTo(0, -42 * scale);
  context.quadraticCurveTo(15 * scale, -31 * scale, 17 * scale, -11 * scale);
  context.lineTo(14 * scale, 26 * scale);
  context.quadraticCurveTo(10 * scale, 38 * scale, 0, 42 * scale);
  context.quadraticCurveTo(-10 * scale, 38 * scale, -14 * scale, 26 * scale);
  context.lineTo(-17 * scale, -11 * scale);
  context.quadraticCurveTo(-15 * scale, -31 * scale, 0, -42 * scale);
  context.closePath();
  context.fill();

  context.fillStyle = '#8a5a33';
  context.beginPath();
  context.moveTo(0, -37 * scale);
  context.quadraticCurveTo(11 * scale, -26 * scale, 12 * scale, -9 * scale);
  context.lineTo(10 * scale, 21 * scale);
  context.quadraticCurveTo(7 * scale, 30 * scale, 0, 34 * scale);
  context.quadraticCurveTo(-7 * scale, 30 * scale, -10 * scale, 21 * scale);
  context.lineTo(-12 * scale, -9 * scale);
  context.quadraticCurveTo(-11 * scale, -26 * scale, 0, -37 * scale);
  context.closePath();
  context.fill();

  context.strokeStyle = '#2a1c12';
  context.lineWidth = 2.4 * scale;
  context.beginPath();
  context.moveTo(2 * scale, 8 * scale);
  context.lineTo(-8 * scale, -52 * scale);
  context.stroke();
  context.beginPath();
  context.moveTo(-1 * scale, -34 * scale);
  context.lineTo(12 * scale, -38 * scale);
  context.stroke();
  context.beginPath();
  context.moveTo(-3 * scale, -20 * scale);
  context.lineTo(9 * scale, -23 * scale);
  context.stroke();
  context.beginPath();
  context.moveTo(-5 * scale, 4 * scale);
  context.lineTo(-16 * scale, -16 * scale);
  context.stroke();

  context.fillStyle = 'rgba(30, 32, 38, .88)';
  context.beginPath();
  context.moveTo(0, -49 * scale);
  context.lineTo(18 * scale, -43 * scale);
  context.lineTo(14 * scale, -36 * scale);
  context.lineTo(20 * scale, -30 * scale);
  context.lineTo(11 * scale, -25 * scale);
  context.lineTo(14 * scale, -19 * scale);
  context.lineTo(6 * scale, -22 * scale);
  context.lineTo(3 * scale, -35 * scale);
  context.closePath();
  context.fill();

  context.beginPath();
  context.moveTo(-2 * scale, -30 * scale);
  context.lineTo(11 * scale, -25 * scale);
  context.lineTo(8 * scale, -18 * scale);
  context.lineTo(13 * scale, -13 * scale);
  context.lineTo(4 * scale, -15 * scale);
  context.lineTo(1 * scale, -22 * scale);
  context.closePath();
  context.fill();

  context.beginPath();
  context.moveTo(-6 * scale, -1 * scale);
  context.lineTo(-15 * scale, -13 * scale);
  context.lineTo(-11 * scale, -8 * scale);
  context.lineTo(-16 * scale, 0);
  context.lineTo(-9 * scale, -2 * scale);
  context.lineTo(-10 * scale, 6 * scale);
  context.closePath();
  context.fill();

  context.restore();
}

function drawShip(scale: number) {
  context.save();
  if (sinkingWhirlpool) {
    const t = Math.min(1, sinkingElapsed / whirlpoolSinkDuration);
    const eased = t * t;
    const angle = sinkStartAngle + eased * Math.PI * 6;
    const radius = sinkStartRadius * (1 - eased);
    const shrink = Math.max(0, 1 - eased);
    const drawX = sinkingWhirlpool.x + Math.cos(angle) * radius;
    const drawY = sinkingWhirlpool.y + scroll + Math.sin(angle) * radius;
    context.translate(drawX * scale, drawY * scale);
    context.rotate(angle + Math.PI);
    context.scale(shrink, shrink);
    if (shrink <= 0.002) {
      context.restore();
      return;
    }
  } else if (crashKind === 'whirlpool') {
    context.restore();
    return;
  } else {
    context.translate(boat.x * scale, boat.y * scale);
  }
  if (crashKind === 'land') {
    drawShipwreck(scale);
    context.restore();
    return;
  }
  context.fillStyle = 'rgba(0, 22, 29, .3)';
  context.beginPath();
  context.ellipse(2 * scale, 8 * scale, 22 * scale, 43 * scale, 0, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = '#422719';
  context.beginPath();
  context.moveTo(0, -43 * scale);
  context.quadraticCurveTo(15 * scale, -32 * scale, 17 * scale, -12 * scale);
  context.lineTo(14 * scale, 27 * scale);
  context.quadraticCurveTo(10 * scale, 40 * scale, 0, 44 * scale);
  context.quadraticCurveTo(-10 * scale, 40 * scale, -14 * scale, 27 * scale);
  context.lineTo(-17 * scale, -12 * scale);
  context.quadraticCurveTo(-15 * scale, -32 * scale, 0, -43 * scale);
  context.closePath();
  context.fill();

  context.fillStyle = '#a96f3f';
  context.beginPath();
  context.moveTo(0, -38 * scale);
  context.quadraticCurveTo(11 * scale, -27 * scale, 12 * scale, -10 * scale);
  context.lineTo(10 * scale, 25 * scale);
  context.quadraticCurveTo(7 * scale, 34 * scale, 0, 39 * scale);
  context.quadraticCurveTo(-7 * scale, 34 * scale, -10 * scale, 25 * scale);
  context.lineTo(-12 * scale, -10 * scale);
  context.quadraticCurveTo(-11 * scale, -27 * scale, 0, -38 * scale);
  context.closePath();
  context.fill();

  context.fillStyle = '#d9b276';
  context.fillRect(-7 * scale, -25 * scale, 14 * scale, 47 * scale);
  context.fillStyle = '#5a3824';
  context.fillRect(-8 * scale, 19 * scale, 16 * scale, 7 * scale);
  context.fillStyle = '#38251b';
  context.fillRect(-7 * scale, -5 * scale, 14 * scale, 5 * scale);

  context.strokeStyle = '#3b291e';
  context.lineWidth = 2 * scale;
  context.beginPath();
  context.moveTo(0, -30 * scale);
  context.lineTo(0, 24 * scale);
  context.stroke();
  [-18, 7].forEach((mastY) => {
    context.fillStyle = '#332218';
    context.beginPath();
    context.arc(0, mastY * scale, 3 * scale, 0, Math.PI * 2);
    context.fill();
  });

  context.fillStyle = 'rgba(246, 232, 193, .82)';
  context.beginPath();
  context.moveTo(-3 * scale, -27 * scale);
  context.lineTo(-15 * scale, -15 * scale);
  context.lineTo(-3 * scale, -8 * scale);
  context.closePath();
  context.fill();
  context.beginPath();
  context.moveTo(3 * scale, -14 * scale);
  context.lineTo(15 * scale, -4 * scale);
  context.lineTo(3 * scale, 2 * scale);
  context.closePath();
  context.fill();
  context.restore();
}

function draw() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const scale = Math.min(width / world.width, height / world.height);
  const offsetX = (width - world.width * scale) / 2;
  const offsetY = (height - world.height * scale) / 2;
  // Paint the full physical canvas first, independent of the clientWidth/
  // clientHeight-based scale math above: on some mobile browsers a
  // sub-pixel rounding gap can appear between that logical size and the
  // canvas's actual rendered box, letting the frame's own light-blue CSS
  // background show through at an edge. This guarantees full coverage
  // regardless of any such mismatch.
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = deepColor;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();
  context.save();
  context.translate(offsetX, offsetY);
  context.fillStyle = deepColor;
  context.fillRect(0, 0, world.width * scale, world.height * scale);
  drawShallowGroups(scroll, scale);
  drawChartGrid(scroll, scale);
  drawWhirlpools(scale);
  drawMantaSchool(scale);
  drawOctopuses(scale);
  for (const landmass of landmasses) drawLandmass(landmass, scroll, scale, false);
  for (const landmass of landmasses) drawLandmass(landmass, scroll, scale);

  drawDolphinPod(scale);
  drawWhalePods(scale);
  drawTurtles(scale);
  drawBuffaloes(scale);
  drawShip(scale);
  drawFogPatches(scale);
  context.restore();

  drawFlocks();

  distanceElement.textContent = `${Math.floor(survived / 1000)} s`;
  const elapsedSeconds = Math.floor(survived / 1000);
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  elapsedTimeElement.textContent = `${elapsedMinutes}:${String(elapsedSeconds % 60).padStart(2, '0')}`;
}

function steeringLabel() {
  if (keys.has('arrowleft')) return 'LEFT';
  if (keys.has('arrowright')) return 'RIGHT';
  return 'CENTER';
}

function frame(now: number) {
  const delta = Math.min(40, now - lastTime);
  lastTime = now;
  update(delta);
  updateFlocks(delta);
  draw();
  requestAnimationFrame(frame);
}

function beginOrResetVoyage() {
  if (crashed) resetVoyage();
  started = true;
  statusElement.textContent = 'Underway';
  startBanner.hidden = true;
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space') {
    beginOrResetVoyage();
    event.preventDefault();
  }
  if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { keys.add(event.key.toLowerCase()); event.preventDefault(); }
});
window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', resizeCanvas);
if (typeof ResizeObserver !== 'undefined') {
  const canvasResizeObserver = new ResizeObserver(() => resizeCanvas());
  canvasResizeObserver.observe(canvas);
}
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => resizeCanvas()).catch(() => {});
}

canvas.addEventListener('pointerdown', (event) => {
  beginOrResetVoyage();
  event.preventDefault();
});

function bindNavButton(button: HTMLButtonElement, key: string) {
  const press = (event: PointerEvent) => {
    keys.add(key);
    button.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const release = (event: PointerEvent) => {
    keys.delete(key);
    event.preventDefault();
  };
  button.addEventListener('pointerdown', press);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('contextmenu', (event) => event.preventDefault());
}

bindNavButton(navLeftButton, 'arrowleft');
bindNavButton(navRightButton, 'arrowright');

resizeCanvas();
requestAnimationFrame(frame);
