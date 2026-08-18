import React from 'react';
import { ErrorBoundary } from '../../../../components/shared/ErrorBoundary';
// FIXPLAN P3.8: the step-type → template map lives in ONE place now
// (apps/board/templates/boardMap.tsx), shared with the projector's
// ClassroomBoard — the two hand-mirrored switches had already drifted once
// (a44e1bb).
import { BOARD_MAP } from '../../../board/templates/boardMap';

export const BoardRenderer: React.FC<{ currentStep: any }> = ({ currentStep }) => {
  const BoardComponent = BOARD_MAP[currentStep.type];

  if (BoardComponent) {
    if (currentStep.type === 'UNIT_SELECTION') {
      return <BoardComponent />;
    }
    return (
      <ErrorBoundary>
        <BoardComponent data={currentStep.data} />
      </ErrorBoundary>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full text-white bg-slate-900">
      <div className="text-2xl font-bold mb-2">Unknown Slide Type</div>
      <div className="font-mono text-slate-500">{currentStep.type}</div>
    </div>
  );
};
