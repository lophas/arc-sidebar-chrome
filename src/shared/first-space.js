// Build a draft only: opening/cancelling an editor must not create a Space.
export function prepareFirstSpace(model, state) {
  model ||= {version:2, favorites:[], spaces:[]};
  if (model.spaces?.length) return {model, created:false};
  model.spaces ||= [];
  // Stable identity lets concurrent first-item drafts merge into one Space.
  const space = {id:'__my_space__', title:'My Space', emoji:'🚀', children:[]};
  model.spaces.push(space);
  state.currentSpaceId = space.id;
  return {model, created:true};
}
