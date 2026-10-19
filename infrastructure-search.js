// 전체 지도·동네 주변·편집자 지도가 같은 검색 및 업종 구분을 사용한다.
var InfrastructureSearch = (function () {
  function matchesCategory(place, categoryName) {
    if (!categoryName) return true;
    return String(place.category_name || "")
      .split(/\s*>\s*/)
      .indexOf(categoryName) !== -1;
  }

  function search(service, config, bounds, onResults) {
    var seen = Object.create(null);
    function handleResults(data, status) {
      var places = Array.isArray(data) ? data : [];
      var filtered = places.filter(function (place) {
        if (!matchesCategory(place, config.categoryName) || seen[place.id])
          return false;
        seen[place.id] = true;
        return true;
      });
      onResults(filtered, status);
    }
    (config.keywords || []).forEach(function (keyword) {
      service.keywordSearch(keyword, handleResults, { bounds: bounds });
    });
    (config.categories || []).forEach(function (code) {
      service.categorySearch(code, handleResults, { bounds: bounds });
    });
  }

  return { matchesCategory: matchesCategory, search: search };
})();
