import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AssetWorkshop from './AssetWorkshop';

// Phase 2.3 / G2 fix (advisor Q2): AssetWorkshop as a ROUTE keyed by unit id, so
// the approve/reject "Review" pass is reachable any time — not only inline right
// after a fresh upload (which was gap G2: unreachable after first run). The Unit
// Studio surfaces a "Review" action that navigates here.
//
// NOTE on approval state (advisor Q2/Q5): AssetWorkshop's _approved flags are
// TRANSIENT component state (defaulting to approved). Re-entering Review re-runs
// the assessment pass — matching job 2's existing "auto re-enrich empty
// categories on load" behavior. This is explicitly an interim model: a DURABLE
// review-status field (reviewed_at / content_review_status table) lands in step C
// and will replace this assumption. Do not build anything that depends on
// _approved being durable until then.

const ReviewRoute: React.FC = () => {
  const { unitId } = useParams<{ unitId: string }>();
  const navigate = useNavigate();
  if (!unitId) return null;
  return (
    <AssetWorkshop
      unitId={unitId}
      onBack={() => navigate(`/teacher/unit/${unitId}`)}
      onOrchestrate={(id) => navigate(`/teacher/unit/${id}`)}
    />
  );
};

export default ReviewRoute;
