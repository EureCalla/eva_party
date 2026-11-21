(function () {
  "use strict";

  const wall = document.getElementById("wall");
  const screen = document.getElementById("feast-finale");
  const photo = document.getElementById("feast-photo");
  const comments = document.getElementById("feast-photo-comments");
  const empty = document.getElementById("feast-photo-empty");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const SPEED = 72; // CSS pixels per second
  const LANES = [17, 50, 83];

  let replies = [];
  let signature = "";
  let next = 0;
  let frame = 0;
  let lastTime = 0;
  let elapsed = 0;
  let availableAt = [];
  let moving = [];

  function replyElement(reply) {
    const item = document.createElement("p");
    item.className = "feast-comment";
    const people = document.createElement("strong");
    people.textContent = reply.sender_animal + " " + reply.sender_name + " 對 " +
      reply.giver_animal + " " + reply.giver_name + " 說";
    item.append(people, document.createTextNode("：" + reply.message));
    return item;
  }

  function resetComments() {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
    elapsed = 0;
    next = 0;
    availableAt = LANES.map((_, i) => i * 0.85);
    moving = [];
    comments.textContent = "";
  }

  function tick(time) {
    const delta = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0;
    lastTime = time;
    elapsed += delta;
    const width = photo.clientWidth;
    for (const item of moving) {
      item.x -= SPEED * delta;
      item.el.style.transform = "translate3d(" + item.x + "px, -50%, 0)";
      if (item.x + item.width < 0) item.el.remove();
    }
    moving = moving.filter((item) => item.x + item.width >= 0);
    // Start the next message once the previous line has cleared the entrance.
    for (const [lane, top] of LANES.entries()) {
      if (!width || elapsed < availableAt[lane]) continue;
      const el = replyElement(replies[next]);
      next = (next + 1) % replies.length;
      const x = moving.length === 0 ? width * 0.64 : width;
      el.style.top = top + "%";
      el.style.transform = "translate3d(" + x + "px, -50%, 0)";
      comments.appendChild(el);
      const item = { el, x, width: el.offsetWidth };
      moving.push(item);
      availableAt[lane] = elapsed + Math.max(1.2, (x + item.width - width + 38) / SPEED);
    }
    frame = requestAnimationFrame(tick);
  }

  function updateMotion() {
    resetComments();
    const still = reducedMotion.matches;
    photo.classList.toggle("still", still);
    if (screen.hidden || !replies.length) return;
    if (still) replies.forEach((reply) => comments.appendChild(replyElement(reply)));
    else frame = requestAnimationFrame(tick);
  }

  function render(messages) {
    const visible = Array.isArray(messages);
    const wasVisible = !screen.hidden;
    screen.hidden = !visible;
    wall.classList.toggle("feast-finale-open", visible);
    if (!visible) {
      if (wasVisible) {
        replies = [];
        signature = "";
        resetComments();
      }
      return;
    }
    empty.hidden = messages.length > 0;
    const updated = JSON.stringify(messages);
    if (wasVisible && updated === signature) return;
    signature = updated;
    replies = messages;
    if (!wasVisible || reducedMotion.matches || !frame || !replies.length) updateMotion();
    else next %= replies.length;
  }

  reducedMotion.addEventListener("change", updateMotion);
  window.FeastFinale = { render };
})();
