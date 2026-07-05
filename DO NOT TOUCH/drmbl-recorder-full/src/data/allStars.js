// All-Star Game data + boot helper.
//
// The All-Star game is an exhibition: the two squads are ad-hoc (players drawn
// from every team's roster), so none of the normal league/season/game/team
// selection applies. Entering via /drmbl-recorder/full/?allstar (or the Home
// screen button) dispatches START_ALLSTAR, which seeds both sides with the
// shared POOL below and jumps straight to the split squad-assignment screen.
//
// Real playerIDs/teamIDs are kept so the box score stays joinable to players,
// but the box score is flagged allStarGame + saved as customGame so it can
// never touch the schedule, standings, or season stats.

import { fetchDrmblActiveSeason } from './api';

export const ALL_STAR_TEAMS = {
  home: { teamID: 'DRMBL.AllStars_East.Exhibition', name: 'East All-Stars' },
  away: { teamID: 'DRMBL.AllStars_West.Exhibition', name: 'West All-Stars' },
};

// Used only if the active-season fetch fails before End Game (the save API
// requires a season id). Matches the live Cosmos Seasons doc id.
export const ALL_STAR_FALLBACK_SEASON_ID = "DRMBL - Men's Open - Spring 2026";

// 24 All-Stars + 8 Honorable Mentions (honor: 'HM'), Spring 2026.
// playerIDs/teamIDs pulled from the live season rosters — do not hand-edit IDs.
export const ALL_STAR_POOL = [
  { playerID: 'Alex_Melendez$2',        name: 'Alex Melendez',        teamID: 'DRMBL.The_Reapers.Mens.Open',  teamName: 'The Reapers' },
  { playerID: 'Angel_Alonso$5',         name: 'Angel Alonso',         teamID: 'DRMBL.DR_Elite.Mens.Open',     teamName: 'DR Elite' },
  { playerID: 'Cameron_Rodgers$87',     name: 'Cameron Rodgers',      teamID: 'DRMBL.R_Blitz.Mens.Open',      teamName: 'R. Blitz' },
  { playerID: 'Christian_Lathan$14',    name: 'Christian Lathan',     teamID: 'DRMBL.Del_Rio_Heat.Mens.Open', teamName: 'Del Rio Heat' },
  { playerID: 'Christian_Washington$10',name: 'Christian Washington', teamID: 'DRMBL.R_Blitz.Mens.Open',      teamName: 'R. Blitz' },
  { playerID: 'Chuck_Blum$115',         name: 'Chuck Blum',           teamID: 'DRMBL.R_Blitz.Mens.Open',      teamName: 'R. Blitz' },
  { playerID: 'Edwin_Moncada$16',       name: 'Edwin Moncada',        teamID: 'DRMBL.Del_Rio_Heat.Mens.Open', teamName: 'Del Rio Heat' },
  { playerID: 'Francisco_Avendano$79',  name: 'Francisco Avendano',   teamID: 'DRMBL.Kings.Mens.Open',        teamName: 'Kings' },
  { playerID: 'Francisco_Padilla$21',   name: 'Francisco Padilla',    teamID: 'DRMBL.DR_Elite.Mens.Open',     teamName: 'DR Elite' },
  { playerID: 'Gabriel_Esquivel$22',    name: 'Gabriel Esquivel',     teamID: 'DRMBL.R_Blitz.Mens.Open',      teamName: 'R. Blitz' },
  { playerID: 'Jacob_Scott$28',         name: 'Jacob Scott',          teamID: 'DRMBL.Wonderland.Mens.Open',   teamName: 'Wonderland' },
  { playerID: 'James_Thadon$111',       name: 'James Thadon',         teamID: 'DRMBL.Air_Ballers.Mens.Open',  teamName: 'Air Ballers' },
  { playerID: 'Jordan_Balderas$37',     name: 'Jordan Balderas',      teamID: 'DRMBL.Air_Ballers.Mens.Open',  teamName: 'Air Ballers' },
  { playerID: 'Jose_Garcia$39',         name: 'José Garcia',          teamID: 'DRMBL.Wonderland.Mens.Open',   teamName: 'Wonderland' },
  { playerID: 'Juan_Gonzalez$42',       name: 'Juan González',        teamID: 'DRMBL.Wonderland.Mens.Open',   teamName: 'Wonderland' },
  { playerID: 'Julian_Dominguez$43',    name: 'Julian Dominguez',     teamID: 'DRMBL.DR_Elite.Mens.Open',     teamName: 'DR Elite' },
  { playerID: 'Kadeem_Edmonson$109',    name: 'Kadeem Edmonson',      teamID: 'DRMBL.Air_Ballers.Mens.Open',  teamName: 'Air Ballers' },
  { playerID: 'Kenneth_Aleta$45',       name: 'Kenneth Aleta',        teamID: 'DRMBL.Wonderland.Mens.Open',   teamName: 'Wonderland' },
  { playerID: 'Malik_Mumpfield$77',     name: 'Malik Mumpfield',      teamID: 'DRMBL.R_Blitz.Mens.Open',      teamName: 'R. Blitz' },
  { playerID: 'Marshall_McKee$80',      name: 'Marshall McKee',       teamID: 'DRMBL.Kings.Mens.Open',        teamName: 'Kings' },
  { playerID: 'Mat_Peeler$51',          name: 'Mat Peeler',           teamID: 'DRMBL.Del_Rio_Heat.Mens.Open', teamName: 'Del Rio Heat' },
  { playerID: 'Nathan_Robinson$76',     name: 'Nathan Robinson',      teamID: 'DRMBL.R_Blitz.Mens.Open',      teamName: 'R. Blitz' },
  { playerID: 'Roy_Dominguez$120',      name: 'Roy Dominguez',        teamID: 'DRMBL.Cash_Kings.Mens.Open',   teamName: 'Cash Kings' },
  { playerID: 'Tucker_Terlizzi$75',     name: 'Tucker Terlizzi',      teamID: 'DRMBL.R_Blitz.Mens.Open',      teamName: 'R. Blitz' },
  { playerID: 'Alan_Dobbins$119',       name: 'Alan Dobbins',         teamID: 'DRMBL.Cash_Kings.Mens.Open',   teamName: 'Cash Kings',   honor: 'HM' },
  { playerID: 'Alexis_Flores$118',      name: 'Alexis Flores',        teamID: 'DRMBL.The_Reapers.Mens.Open',  teamName: 'The Reapers',  honor: 'HM' },
  { playerID: 'Angel_Contreras$4',      name: 'Angel Contreras',      teamID: 'DRMBL.The_Reapers.Mens.Open',  teamName: 'The Reapers',  honor: 'HM' },
  { playerID: 'Enrique_Bustos$81',      name: 'Enrique Bustos',       teamID: 'DRMBL.Kings.Mens.Open',        teamName: 'Kings',        honor: 'HM' },
  { playerID: 'Jacob_Hernandez$27',     name: 'Jacob Hernandez',      teamID: 'DRMBL.The_Reapers.Mens.Open',  teamName: 'The Reapers',  honor: 'HM' },
  { playerID: 'Joel_Dominguez$34',      name: 'Joel Dominguez',       teamID: 'DRMBL.DR_Elite.Mens.Open',     teamName: 'DR Elite',     honor: 'HM' },
  { playerID: 'Kameron_Williams$9',     name: 'Kameron Williams',     teamID: 'DRMBL.Del_Rio_Heat.Mens.Open', teamName: 'Del Rio Heat', honor: 'HM' },
  { playerID: 'Leonel_Dominguez$46',    name: 'Leonel Dominguez',     teamID: 'DRMBL.The_Reapers.Mens.Open',  teamName: 'The Reapers',  honor: 'HM' },
];

// Enter All-Star mode: seed state immediately (rosters are bundled, no network
// needed to start assigning squads), then attach the active season in the
// background — it's only required at End Game time for the save payload.
export async function startAllStarFlow(dispatch) {
  dispatch({ type: 'START_ALLSTAR' });
  try {
    const season = await fetchDrmblActiveSeason();
    if (season) dispatch({ type: 'ALLSTAR_SET_SEASON', season });
  } catch (e) {
    // Non-fatal: End Game falls back to ALL_STAR_FALLBACK_SEASON_ID.
  }
}
