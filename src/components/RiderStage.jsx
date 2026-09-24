import { Component, lazy, Suspense } from 'react';
import RiderFigure from './RiderFigure.jsx';

const Rider3D = lazy(() => import('./Rider3D.jsx'));

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

// If the 3D scene throws (e.g. WebGL context lost), fall back to the SVG figure.
class Fallback extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

// Real 3D rider when the browser supports it, 2.5D SVG rider while loading or as a fallback.
export default function RiderStage(props) {
  const flat = <RiderFigure {...props} />;
  if (!canUse3D()) return flat;
  return (
    <Fallback fallback={flat}>
      <Suspense fallback={flat}>
        <Rider3D {...props} />
      </Suspense>
    </Fallback>
  );
}
