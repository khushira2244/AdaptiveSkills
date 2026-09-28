const { withInfoPlist } = require("@expo/config-plugins");

/** Keep the existing Android portrait behavior while allowing iPad rotation. */
module.exports = function withIosOrientation(config) {
  return withInfoPlist(config, (next) => {
    next.modResults.UIRequiresFullScreen = false;
    next.modResults.UISupportedInterfaceOrientations = [
      "UIInterfaceOrientationPortrait",
    ];
    next.modResults["UISupportedInterfaceOrientations~ipad"] = [
      "UIInterfaceOrientationPortrait",
      "UIInterfaceOrientationPortraitUpsideDown",
      "UIInterfaceOrientationLandscapeLeft",
      "UIInterfaceOrientationLandscapeRight",
    ];
    return next;
  });
};
