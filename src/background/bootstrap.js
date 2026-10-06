// Background entry point.
// Keep feature modules explicit here so individual modules do not need to
// import unrelated side-effect modules just to make them run.
import './group-order.js';
import './native-panel-reload.js';
import './service-worker.js';
