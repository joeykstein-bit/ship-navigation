import './style.css';

type Point = { x: number; y: number };
type ForestCircle = { x: number; y: number; radius: number; color: string };
type Landmass = { points: Point[]; forestCircles: ForestCircle[] };
type MantaMember = { x: number; y: number; phase: number; scale: number };
type BayDolphin = { angle: number; speed: number; radius: number; phase: number };
type BayFish = { angle: number; speed: number; radius: number; size: number };
type WildlifeScene = { dolphinBay: Point; mantaCenter: Point };
type Octopus = { x: number; y: number; phase: number; emergedUntil: number };

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas')!;
const context = canvas.getContext('2d')!;
const distanceElement = document.querySelector<HTMLElement>('#distance')!;
const statusElement = document.querySelector<HTMLElement>('#voyage-status')!;
const startBanner = document.querySelector<HTMLElement>('#start-banner')!;

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
let lastTime = performance.now();

const landmasses: Landmass[] = [];
const forestColors = ['#2f6b35', '#367d3b', '#438f43', '#28602f', '#559b4d', '#1f5429'];

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
  const candidate: Landmass = { points, forestCircles: [] };
  const bounds = landmassBounds(candidate);
  const circleCount = Math.min(180, 24 + Math.floor((width * height) / 2600));
  for (let circleIndex = 0; circleIndex < circleCount; circleIndex += 1) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const circle = {
        x: bounds.left + Math.random() * (bounds.right - bounds.left),
        y: bounds.top + Math.random() * (bounds.bottom - bounds.top),
        radius: (6 + Math.random() * 9) / 2,
        color: forestColors[Math.floor(Math.random() * forestColors.length)],
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
  return landmasses.some((landmass) => pointInPolygon(point, landmass.points));
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

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const bounds = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(bounds.width * ratio));
  canvas.height = Math.max(1, Math.floor(bounds.height * ratio));
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function resetVoyage() {
  boat.x = world.width / 2;
  scroll = 0;
  survived = 0;
  crashed = false;
  started = false;
  startBanner.hidden = false;
  dolphinPodElapsed = null;
  dolphinPodSeen = false;
  wildlifeMinute = 1;
  statusElement.textContent = 'Ready';
  document.querySelector('.status-dot')?.classList.remove('status-dot--complete');
}

function update(delta: number) {
  if (!started || crashed) return;
  const steering = (keys.has('arrowright') ? 1 : 0) - (keys.has('arrowleft') ? 1 : 0);
  boat.x += steering * delta * 0.32;
  boat.x = Math.max(boat.width, Math.min(world.width - boat.width, boat.x));
  scroll += delta * 0.075;
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
  octopuses.forEach((octopus) => {
    if (octopus.emergedUntil === 0 && Math.hypot(boatMapPosition.x - octopus.x, boatMapPosition.y - octopus.y) < 50) octopus.emergedUntil = survived + 5500;
  });

  const mapY = boat.y - scroll;
  const collisionPoints = [
    { x: boat.x, y: mapY },
    { x: boat.x - boat.width / 2, y: mapY + boat.height / 3 },
    { x: boat.x + boat.width / 2, y: mapY + boat.height / 3 },
  ];
  if (collisionPoints.some(isLand)) {
    crashed = true;
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
  context.fillStyle = forestColor;
  context.fill();
  for (const circle of landmass.forestCircles) {
    context.beginPath();
    context.arc(circle.x * scale, (circle.y + yOffset) * scale, circle.radius * scale, 0, Math.PI * 2);
    context.fillStyle = circle.color;
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

function drawOctopus(octopus: Octopus, scale: number) {
  const screenY = octopus.y + scroll;
  if (screenY < -120 || screenY > world.height + 120 || isLand({ x: octopus.x, y: octopus.y })) return;
  const emerged = octopus.emergedUntil > survived;
  const time = performance.now() * 0.001;
  const emergenceStart = octopus.emergedUntil - 5500;
  const emergenceElapsed = Math.max(0, survived - emergenceStart);
  const approachProgress = Math.min(1, emergenceElapsed / 1400);
  const retreatProgress = Math.min(1, Math.max(0, (emergenceElapsed - 3600) / 1900));
  const movement = retreatProgress > 0 ? 1 - retreatProgress : approachProgress;
  const bodyX = octopus.x + (boat.x - octopus.x) * movement;
  const bodyY = octopus.y + (boat.y - scroll - octopus.y) * movement;
  context.save();
  context.translate(bodyX * scale, (bodyY + scroll) * scale);
  context.strokeStyle = emerged ? '#07192e' : 'rgba(7, 25, 46, .8)';
  context.lineWidth = (emerged ? 7 : 4) * scale;
  context.lineCap = 'round';
  const visibleTentacles = emerged ? 8 : 1 + Math.floor((Math.sin(octopus.phase) + 1) * 0.5);
  for (let tentacle = 0; tentacle < visibleTentacles; tentacle += 1) {
    const angle = tentacle * Math.PI / 4 + Math.sin(time * 0.8 + octopus.phase + tentacle) * 0.12;
    const curl = (Math.sin(time * 1.5 + octopus.phase + tentacle * 0.9) + 1) / 2;
    const length = emerged ? 64 + curl * 18 : 42 + curl * 9;
    const sway = Math.sin(time * 1.5 + octopus.phase + tentacle * 0.9) * (emerged ? 15 : 9);
    const bend = Math.sin(time * 1.5 + octopus.phase + tentacle * 0.9) * (emerged ? 22 : 12);
    const endX = Math.cos(angle) * length + Math.cos(angle + Math.PI / 2) * sway;
    const endY = Math.sin(angle) * length + Math.sin(angle + Math.PI / 2) * sway;
    const midAngle = angle + Math.sin(time * 1.5 + tentacle) * 0.28;
    context.beginPath();
    context.moveTo(0, 0);
    context.quadraticCurveTo(Math.cos(midAngle) * (length * 0.52) * scale + Math.cos(angle + Math.PI / 2) * bend * scale, Math.sin(midAngle) * (length * 0.52) * scale + Math.sin(angle + Math.PI / 2) * bend * scale, endX * scale, endY * scale);
    context.stroke();
  }
  if (emerged) {
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

function drawShip(scale: number) {
  context.save();
  context.translate(boat.x * scale, boat.y * scale);
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
  context.save();
  context.clearRect(0, 0, width, height);
  context.translate(offsetX, offsetY);
  context.fillStyle = deepColor;
  context.fillRect(0, 0, world.width * scale, world.height * scale);
  drawShallowGroups(scroll, scale);
  drawChartGrid(scroll, scale);
  drawMantaSchool(scale);
  drawOctopuses(scale);
  for (const landmass of landmasses) drawLandmass(landmass, scroll, scale, false);
  for (const landmass of landmasses) drawLandmass(landmass, scroll, scale);

  drawDolphinPod(scale);
  drawShip(scale);
  context.restore();

  distanceElement.textContent = `${Math.floor(survived / 1000)} s`;
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
  draw();
  requestAnimationFrame(frame);
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space') {
    if (crashed) resetVoyage();
    started = true;
    statusElement.textContent = 'Underway';
    startBanner.hidden = true;
    event.preventDefault();
  }
  if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { keys.add(event.key.toLowerCase()); event.preventDefault(); }
});
window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
window.addEventListener('resize', resizeCanvas);
resizeCanvas();
requestAnimationFrame(frame);
