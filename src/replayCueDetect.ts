//#region 常量/配置
const TABLE_CENTER_X_MM = 1370;
const TABLE_TOP_Y_MM = 785;
const BALL_RADIUS_MM = 20;
const NEAR_TABLE_Y_MM = TABLE_TOP_Y_MM + BALL_RADIUS_MM + 28;
const POST_BOUNCE_WINDOW_S = 0.12;
const MIN_SIDE_PEAK_MM = 35;
const MIN_KICK_DELTA_MPS = 0.15;
const MIN_BRAKE_DELTA_MPS = 0.12;
const MIN_SINK_RATE_MMPS = 900;
const MIN_RECEIVE_RISE_MM = 18;
//#endregion

//#region 模型/类型
export interface ReplayCueSample {
  time: number;
  x: number;
  y: number;
  z: number;
}

export interface DetectedReplayCueEvents {
  opponentLaunch: number;
  opponentApex: number | null;
  serverBounce: number | null;
  net: number | null;
  receiveBounce: number | null;
  riseMid: number | null;
  riseEnd: number | null;
  receiveApex: number | null;
  fallEarly: number | null;
  fallMid: number | null;
  fallLate: number | null;
  ground: number | null;
  sidePeak: number | null;
  postBounceKick: number | null;
  postBounceBrake: number | null;
  postNetSink: number | null;
  contact: number;
}
//#endregion

//#region 私有成员
function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(length - 1, index));
}

function sampleAt(samples: ReplayCueSample[], index: number): ReplayCueSample {
  return samples[clampIndex(index, samples.length)];
}

function velocityX(samples: ReplayCueSample[], index: number): number {
  const i = clampIndex(index, samples.length);
  if (samples.length < 2) return 0;
  if (i <= 0) {
    const dt = Math.max(1e-4, samples[1].time - samples[0].time);
    return ((samples[1].x - samples[0].x) / 1000) / dt;
  }
  if (i >= samples.length - 1) {
    const a = samples[samples.length - 2];
    const b = samples[samples.length - 1];
    return ((b.x - a.x) / 1000) / Math.max(1e-4, b.time - a.time);
  }
  const a = samples[i - 1];
  const b = samples[i + 1];
  return ((b.x - a.x) / 1000) / Math.max(1e-4, b.time - a.time);
}

function velocityY(samples: ReplayCueSample[], index: number): number {
  const i = clampIndex(index, samples.length);
  if (samples.length < 2) return 0;
  if (i <= 0) {
    const dt = Math.max(1e-4, samples[1].time - samples[0].time);
    return ((samples[1].y - samples[0].y) / 1000) / dt;
  }
  if (i >= samples.length - 1) {
    const a = samples[samples.length - 2];
    const b = samples[samples.length - 1];
    return ((b.y - a.y) / 1000) / Math.max(1e-4, b.time - a.time);
  }
  const a = samples[i - 1];
  const b = samples[i + 1];
  return ((b.y - a.y) / 1000) / Math.max(1e-4, b.time - a.time);
}

function indexAtOrAfter(samples: ReplayCueSample[], time: number): number {
  let right = 0;
  while (right < samples.length && samples[right].time < time) right += 1;
  return clampIndex(right, samples.length);
}

function timeAtHeightFraction(
  samples: ReplayCueSample[],
  startIdx: number,
  endIdx: number,
  y0: number,
  y1: number,
  fraction: number,
): number | null {
  if (endIdx <= startIdx) return null;
  const targetY = y0 + (y1 - y0) * fraction;
  const ascending = y1 >= y0;
  for (let i = startIdx; i <= endIdx; i += 1) {
    const y = samples[i].y;
    if (ascending ? y >= targetY : y <= targetY) return samples[i].time;
  }
  return samples[endIdx].time;
}

function detectGeometricBounces(samples: ReplayCueSample[]): number[] {
  const times: number[] = [];
  for (let i = 1; i < samples.length - 1; i += 1) {
    const prev = samples[i - 1];
    const cur = samples[i];
    const next = samples[i + 1];
    if (cur.y > NEAR_TABLE_Y_MM) continue;
    if (!(prev.y >= cur.y && next.y >= cur.y)) continue;
    if (!(velocityY(samples, i - 1) < 0.05 && velocityY(samples, i + 1) > -0.05)) continue;
    if (times.length > 0 && cur.time - times[times.length - 1] < 0.05) continue;
    times.push(cur.time);
    if (times.length >= 3) break;
  }
  return times;
}

function classifyBounces(
  samples: ReplayCueSample[],
  bounceTimes: number[],
  isServe: boolean,
): { serverBounce: number | null; receiveBounce: number | null; ground: number | null } {
  if (bounceTimes.length === 0) {
    return { serverBounce: null, receiveBounce: null, ground: null };
  }
  if (!isServe) {
    return {
      serverBounce: null,
      receiveBounce: bounceTimes[0] ?? null,
      ground: bounceTimes[1] ?? null,
    };
  }
  let serverBounce: number | null = null;
  let receiveBounce: number | null = null;
  let ground: number | null = null;
  for (const time of bounceTimes) {
    const sample = sampleAt(samples, indexAtOrAfter(samples, time));
    if (sample.x < TABLE_CENTER_X_MM && serverBounce === null) {
      serverBounce = time;
      continue;
    }
    if (sample.x >= TABLE_CENTER_X_MM) {
      if (receiveBounce === null) receiveBounce = time;
      else if (ground === null) ground = time;
    }
  }
  return { serverBounce, receiveBounce, ground };
}

function detectOpponentApex(samples: ReplayCueSample[], receiveBounce: number | null): number | null {
  const limitTime = receiveBounce ?? samples[samples.length - 1].time;
  let bestIndex = -1;
  let bestY = -Infinity;
  for (let i = 0; i < samples.length; i += 1) {
    if (samples[i].time > limitTime) break;
    if (samples[i].y > bestY) {
      bestY = samples[i].y;
      bestIndex = i;
    }
  }
  if (bestIndex <= 0 || bestY < samples[0].y + 25) return null;
  return samples[bestIndex].time;
}

function detectNet(samples: ReplayCueSample[]): number | null {
  for (let i = 1; i < samples.length; i += 1) {
    if (samples[i - 1].x < TABLE_CENTER_X_MM && samples[i].x >= TABLE_CENTER_X_MM) {
      return samples[i].time;
    }
  }
  return null;
}

function detectSidePeak(samples: ReplayCueSample[], limitTime: number | null): number | null {
  const z0 = samples[0].z;
  const endTime = limitTime ?? samples[samples.length - 1].time;
  let bestIndex = -1;
  let bestAbs = 0;
  for (let i = 1; i < samples.length; i += 1) {
    if (samples[i].time > endTime) break;
    const abs = Math.abs(samples[i].z - z0);
    if (abs > bestAbs) {
      bestAbs = abs;
      bestIndex = i;
    }
  }
  if (bestIndex < 0 || bestAbs < MIN_SIDE_PEAK_MM) return null;
  return samples[bestIndex].time;
}

function detectPostBounceSpeedChange(
  samples: ReplayCueSample[],
  bounceTime: number,
  mode: 'kick' | 'brake',
): number | null {
  const start = indexAtOrAfter(samples, bounceTime);
  const vxIn = velocityX(samples, Math.max(0, start - 1));
  let bestIndex = -1;
  let bestDelta = 0;
  for (let i = start; i < samples.length; i += 1) {
    const elapsed = samples[i].time - bounceTime;
    if (elapsed > POST_BOUNCE_WINDOW_S) break;
    if (elapsed < 0.012) continue;
    const delta = velocityX(samples, i) - vxIn;
    if (mode === 'kick' && delta > bestDelta) {
      bestDelta = delta;
      bestIndex = i;
    }
    if (mode === 'brake' && -delta > bestDelta) {
      bestDelta = -delta;
      bestIndex = i;
    }
  }
  const threshold = mode === 'kick' ? MIN_KICK_DELTA_MPS : MIN_BRAKE_DELTA_MPS;
  if (bestIndex < 0 || bestDelta < threshold) return null;
  return samples[bestIndex].time;
}

function detectPostNetSink(
  samples: ReplayCueSample[],
  netTime: number | null,
  receiveBounce: number | null,
): number | null {
  if (netTime === null) return null;
  const start = indexAtOrAfter(samples, netTime);
  const endTime = receiveBounce ?? samples[samples.length - 1].time;
  let bestIndex = -1;
  let bestSink = 0;
  for (let i = start + 1; i < samples.length; i += 1) {
    if (samples[i].time > endTime) break;
    const dt = Math.max(1e-4, samples[i].time - samples[i - 1].time);
    const sinkRate = (samples[i - 1].y - samples[i].y) / dt;
    if (sinkRate > bestSink) {
      bestSink = sinkRate;
      bestIndex = i;
    }
  }
  if (bestIndex < 0 || bestSink < MIN_SINK_RATE_MMPS) return null;
  return samples[bestIndex].time;
}

function detectReceiveArcPhases(
  samples: ReplayCueSample[],
  receiveBounce: number | null,
  groundHint: number | null,
): Pick<
  DetectedReplayCueEvents,
  'riseMid' | 'riseEnd' | 'receiveApex' | 'fallEarly' | 'fallMid' | 'fallLate' | 'ground'
> {
  const empty = {
    riseMid: null,
    riseEnd: null,
    receiveApex: null,
    fallEarly: null,
    fallMid: null,
    fallLate: null,
    ground: groundHint,
  };
  if (receiveBounce === null) return empty;

  const bounceIdx = indexAtOrAfter(samples, receiveBounce);
  const bounceY = samples[bounceIdx].y;
  const limitIdx = groundHint === null
    ? samples.length - 1
    : indexAtOrAfter(samples, groundHint);

  let apexIdx = bounceIdx;
  let apexY = bounceY;
  for (let i = bounceIdx; i <= limitIdx; i += 1) {
    if (samples[i].y > apexY) {
      apexY = samples[i].y;
      apexIdx = i;
    }
  }

  let ground = groundHint;
  if (ground === null) {
    for (let i = Math.max(bounceIdx + 2, apexIdx + 1); i < samples.length - 1; i += 1) {
      const cur = samples[i];
      if (cur.y > NEAR_TABLE_Y_MM) continue;
      if (samples[i - 1].y >= cur.y && samples[i + 1].y >= cur.y) {
        ground = cur.time;
        break;
      }
    }
  }
  const groundIdx = ground === null ? samples.length - 1 : indexAtOrAfter(samples, ground);
  if (!(apexY >= bounceY + MIN_RECEIVE_RISE_MM && apexIdx > bounceIdx)) {
    return { ...empty, ground };
  }

  const fallEndY = samples[groundIdx].y;
  return {
    riseMid: timeAtHeightFraction(samples, bounceIdx, apexIdx, bounceY, apexY, 0.5),
    riseEnd: timeAtHeightFraction(samples, bounceIdx, apexIdx, bounceY, apexY, 0.88),
    receiveApex: samples[apexIdx].time,
    fallEarly: timeAtHeightFraction(samples, apexIdx, groundIdx, apexY, fallEndY, 0.18),
    fallMid: timeAtHeightFraction(samples, apexIdx, groundIdx, apexY, fallEndY, 0.5),
    fallLate: timeAtHeightFraction(samples, apexIdx, groundIdx, apexY, fallEndY, 0.82),
    ground,
  };
}
//#endregion

//#region 公开 API
export function detectReplayCueEvents(
  samples: ReplayCueSample[],
  recordedBounceTimes: number[],
  isServe: boolean,
): DetectedReplayCueEvents {
  const geometric = detectGeometricBounces(samples);
  const bounceTimes = recordedBounceTimes.length > 0 ? recordedBounceTimes.slice(0, 3) : geometric;
  const classified = classifyBounces(samples, bounceTimes, isServe);
  const receiveBounce = classified.receiveBounce;
  const net = detectNet(samples);
  const sidePeak = detectSidePeak(
    samples,
    receiveBounce ?? samples[samples.length - 1].time,
  );
  const arc = detectReceiveArcPhases(samples, receiveBounce, classified.ground);
  return {
    opponentLaunch: samples[0].time,
    opponentApex: detectOpponentApex(samples, receiveBounce),
    serverBounce: classified.serverBounce,
    net,
    receiveBounce,
    sidePeak,
    postBounceKick: receiveBounce === null
      ? null
      : detectPostBounceSpeedChange(samples, receiveBounce, 'kick'),
    postBounceBrake: receiveBounce === null
      ? null
      : detectPostBounceSpeedChange(samples, receiveBounce, 'brake'),
    postNetSink: detectPostNetSink(samples, net, receiveBounce),
    contact: samples[samples.length - 1].time,
    ...arc,
  };
}
//#endregion
