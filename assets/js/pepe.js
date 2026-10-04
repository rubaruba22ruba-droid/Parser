/* Заглушка: будет заменена полноценным модулем героя (Plush Pepe). */
(function () {
  'use strict';
  var FX = window.NTFX = window.NTFX || {};
  FX.pepe = { create: function () { return { start: function () {}, nudge: function () {} }; } };
})();
