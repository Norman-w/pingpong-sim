import { impactArrowDirections } from '../src/features/recordingEffects';
import type { TableImpactEvent } from '../src/domain/tableImpact';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/**
 * Keep the visual force callout tied to the same sign convention as the
 * table-impact resolver. This pure check needs no renderer or recording
 * window, so it can run in the normal regression command.
 */
export async function runSpinRecordingRegressionSuite(): Promise<void> {
  const event: TableImpactEvent = {
    impactSpeed: 2,
    restitution: 0.94,
    normalImpulse: 0.01,
    tangentialImpulse: 0.005,
    contactVx: 2,
    contactVz: -1,
    frictionLimited: true,
    beforeTopSpinRpm: -1000,
    afterTopSpinRpm: -500,
    beforeSense: 'backspin',
    afterSense: 'backspin',
    spinReversed: false,
  };

  const directions = impactArrowDirections(event);
  assert(directions.slip.x > 0 && directions.slip.z < 0,
    '绿箭头必须沿接触点相对台面的滑动方向');
  assert(directions.friction.x < 0 && directions.friction.z > 0,
    '橙箭头必须与滑动方向相反，表示台面对球的摩擦');
  assert(directions.normal.x === 0 && directions.normal.y === 1 && directions.normal.z === 0,
    '黄箭头必须沿台面法向向上');
  assert(directions.resultant.x < 0 && directions.resultant.y > 0 && directions.resultant.z > 0,
    '紫箭头必须是橙色切向摩擦与黄色法向冲量的合成方向');

  console.log('✓ 录屏受力箭头方向与碰撞符号一致');
}
