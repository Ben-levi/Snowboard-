import { Component, lazy, Suspense } from 'react';
import RiderFigure from './RiderFigure.jsx';

const Rider3D = lazy(() => import('./Rider3D.jsx'));
const RiderModel = lazy(() => import('./RiderModel.jsx'));
const RiderSpline = lazy(() => import('./RiderSpline.jsx'));
// A rider scene designed in Spline, when configured (see README).
const hasSplineScene = Boolean(import.meta.env.VITE_SPLINE_SCENE);

let webglOk;
function canUse3D() {
  if (webglOk === undefined) {
    // ?flat=1 forces the lightweight 2.5D figure (handy on old phones).
    const flat = new URLSearchParams(window.location.search).has('flat');
    try {
      const c = document.createElement('canvas');
      webglOk = !flat && Boolean(c.getContext('webgl2') || c.getContext('webgl'));
    } catch {
      webglOk = false;
    }
  }
  return webglOk;
}

// If a scene throws (load failure, WebGL context lost), render the fallback instead.
class Fallback extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

// Spline scene if configured, else the pro rider model (public/models), else the built-in 3D rider,
// else (no WebGL / ?flat=1) the 2.5D SVG rider. Each level falls back to the next if it fails.
export default function RiderStage(props) {
  const flat = <RiderFigure {...props} />;
  if (!canUse3D()) return flat;
  const builtIn = (
    <Fallback fallback={flat}>
      <Suspense fallback={flat}>
        <Rider3D {...props} />
      </Suspense>
    </Fallback>
  );
  const model = (
    <Fallback fallback={builtIn}>
      <Suspense fallback={flat}>
        <RiderModel {...props} />
      </Suspense>
    </Fallback>
  );
  if (!hasSplineScene) return model;
  return (
    <Fallback fallback={model}>
      <Suspense fallback={flat}>
        <RiderSpline {...props} />
      </Suspense>
    </Fallback>
  );
}
