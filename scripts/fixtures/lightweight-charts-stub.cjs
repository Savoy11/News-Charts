// A stand-in for lightweight-charts in the offline checks that render a page's explorer on the
// server (check:focus). The library ships only an ES module the checks' loader cannot require, and
// every call to it is made in an effect, which a server render never runs, so nothing here is called.
const none = () => {
  throw new Error("lightweight-charts is not available in the offline checks");
};
module.exports = {
  createChart: none,
  createSeriesMarkers: none,
  AreaSeries: {},
  HistogramSeries: {},
  LineSeries: {},
  ColorType: { Solid: "solid", VerticalGradient: "gradient" },
  CrosshairMode: { Normal: 0, Magnet: 1 },
  LineStyle: { Solid: 0, Dotted: 1, Dashed: 2 },
};
