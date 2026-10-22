// 같은 동네·이름·경계만 합친다. 서로 다른 보조경계와 다른 동네는 유지한다.
var DevelopmentOverlayData = (function () {
  function key(item) {
    return JSON.stringify([
      item.neighborhood_id || "",
      item.name || "",
      (item.polygon || []).map(function (point) {
        return [point.lat, point.lng];
      }),
    ]);
  }

  function hasLabelPosition(item) {
    return item.label_lat != null && item.label_lng != null;
  }

  function prefer(candidate, current) {
    if (hasLabelPosition(candidate) !== hasLabelPosition(current)) {
      return hasLabelPosition(candidate);
    }
    var candidateTime = Date.parse(candidate.created_at) || 0;
    var currentTime = Date.parse(current.created_at) || 0;
    if (candidateTime !== currentTime) return candidateTime > currentTime;
    return (candidate.id || "") >= (current.id || "");
  }

  function deduplicate(items) {
    var unique = [];
    var indices = new Map();
    (items || []).forEach(function (item) {
      var identity = key(item);
      if (!indices.has(identity)) {
        indices.set(identity, unique.length);
        unique.push(item);
      } else {
        var index = indices.get(identity);
        if (prefer(item, unique[index])) unique[index] = item;
      }
    });
    return unique;
  }

  return { deduplicate: deduplicate };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = DevelopmentOverlayData;
}
