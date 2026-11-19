let intervalId = null;
let deadlineAt = 0;

function stop() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function tick() {
  const remainingMs = Math.max(0, deadlineAt - Date.now());
  const finished = remainingMs === 0;
  postMessage({ type: "tick", remainingMs, finished });
  if (finished) stop();
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "stop") {
    stop();
    return;
  }
  if (event.data?.type !== "start" || !Number.isFinite(event.data.deadlineAt)) {
    return;
  }

  stop();
  deadlineAt = event.data.deadlineAt;
  tick();
  if (deadlineAt > Date.now()) {
    intervalId = setInterval(tick, 250);
  }
});
