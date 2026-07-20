import { Truck } from '../types';

const API_URL =
  'https://script.google.com/macros/s/AKfycbyQ0-wIoSztinQW1SiCxOIuxbxDbwDyhzuERWqbkBH1AphJO8gPxNSk28MghnXpP3TiPQ/exec';

export async function fetchTrucksFromSheets(): Promise<Truck[]> {
  const res = await fetch(`${API_URL}?action=dashboard`);

  if (!res.ok) {
    throw new Error('Failed to fetch dashboard');
  }

  return await res.json();
}
export async function updateTruckInSheets(
  truckId: string,
  updates: Partial<Truck>,
  currentTruck: Truck
): Promise<void> {

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'updateTruck',
      truckId,
      status: updates.status ?? currentTruck.status,
      performanceStatus:
        updates.performanceStatus ?? currentTruck.performanceStatus,
      planEta: currentTruck.planEta,
      stampEta: updates.stampEta ?? currentTruck.stampEta,
      stampEtd: updates.stampEtd ?? currentTruck.stampEtd,
      actionProblem: updates.actionProblem ?? currentTruck.actionProblem,
      actionCountermeasure:
        updates.actionCountermeasure ?? currentTruck.actionCountermeasure,
      actionResponsible:
        updates.actionResponsible ?? currentTruck.actionResponsible,
      actionStatus: updates.actionStatus ?? currentTruck.actionStatus
    })
  });

  if (!res.ok) {
    throw new Error('Update failed');
  }
}
