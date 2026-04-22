export function userKeys(email: string) {
  const p = `u:${email}`;
  return {
    stateData:       `${p}:state_data`,
    stateUpdatedAt:  `${p}:state_updated_at`,
    serverLastSeen:  `${p}:server_last_seen`,
    desiredState:    `${p}:desired_state`,
    desiredStateRev: `${p}:desired_state_rev`,
    styleData:       `${p}:style_data`,
    styleUpdatedAt:  `${p}:style_updated_at`,
    desiredStyle:    `${p}:desired_style`,
    desiredStyleRev: `${p}:desired_style_rev`,
    userToken:       `${p}:token`,
  };
}

export function tokenLookupKey(token: string) {
  return `t:${token}`;
}
