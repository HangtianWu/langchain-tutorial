import _ from 'underscore';

export const getDefaultItemIcon = (step) => {
  if (step.isSelected || step.containsSelected) {
    const icon = 'StatusCircleInner';
  }
   if (step.isBehind) {
    return 'SkypeCircleCheck';
  }

  // default
  return 'StatusCircleRing';
};

export const getDefaultItemAriaLabel = (step, i18n) => {
  if (step.isBehind) {
    return i18n.getString(_TL_('Previous step'));
  } else if (step.isSelected || step.containsSelected) {
    return i18n.getString(_TL_('Current step'));
  }
  return i18n.getString(_TL_('Next step'));
};

export const getAllExpandStepIds = (config) => {
  let stepIds = [];
  _.each(config, (s) => {
    if (!_.isEmpty(s.steps)) {
      stepIds = stepIds.concat(getAllExpandStepIds(s.steps));
    } else {
      stepIds.push(s.id);
    }
  });
  return stepIds;
};
