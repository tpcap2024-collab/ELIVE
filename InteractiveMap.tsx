/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Compass, Search, Map, RefreshCw, Radio, Layers } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { TruckData, TruckStatus } from '../types';

interface InteractiveMapProps {
  trucks: TruckData[];
  selectedTruckId: string | null;
  onSelectTruck: (truck: TruckData) => void;
}

// Convert 0-100% relative coordinates to precise physical coordinates in Thailand
const getLatLng = (cx: number, cy: number): [number, number] => {
  // exact mappings for major hubs
  if (cx === 15 && cy === 35) return [13.624926, 101.014618]; // TPCAP HQ (บางพลี)
  if (cx === 48 && cy === 46) return [13.4167, 101.0000]; // Amata City (ชลบุรี)
  if (cx === 60 && cy === 80) return [13.0833, 100.9167]; // Laem Chabang (แหลมฉบัง)
  if (cx === 85 && cy === 82) return [12.6833, 101.1667]; // Map Ta Phut (มาบตาพุด)
  if (cx === 45 && cy === 5) return [14.3333, 100.6333]; // Rojana (อยุธยา)
  if (cx === 25 && cy === 25) return [13.6667, 100.6167]; // Bangna (บางนา)
  if (cx === 28 && cy === 15) return [13.9667, 100.6000]; // Navanakorn (นวนคร)
  if (cx === 45 && cy === 2) return [14.5333, 100.9167]; // Saraburi (สระบุรี)

  // Interpolation mapping for intermediate simulated path points
  const xRatio = (cx - 15) / 70;
  const lng = 100.85 + xRatio * (101.1667 - 100.85);

  const yRatio = (cy - 5) / 77;
  const lat = 14.3333 - yRatio * (14.3333 - 12.6833);

  return [lat, lng];
};

const getStatusColor = (status: TruckStatus) => {
  switch (status) {
    case 'Delivered': return '#10b981'; // green
    case 'Traveling': return '#f59e0b'; // yellow
    case 'At_Area': return '#0ea5e9';   // blue
    case 'Offline': return '#f43f5e';   // red
  }
};

export default function InteractiveMap({ trucks, selectedTruckId, onSelectTruck }: InteractiveMapProps) {
  const [mapType, setMapType] = useState<'roadmap' | 'satellite'>('roadmap');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);
  const routesGroupRef = useRef<L.LayerGroup | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Create Leaflet Map instance
    const map = L.map(mapContainerRef.current, {
      center: [13.624926, 101.014618], // Center around TPCAP HQ
      zoom: 9,
      zoomControl: true,
      attributionControl: true
    });

    mapRef.current = map;

    // Create marker & route layer groups
    markersGroupRef.current = L.layerGroup().addTo(map);
    routesGroupRef.current = L.layerGroup().addTo(map);

    // Initial load of tile layer
    const url = 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';
    tileLayerRef.current = L.tileLayer(url, {
      maxZoom: 20,
      attribution: 'Map data &copy; Google Maps'
    }).addTo(map);

    // Fix leaflet marker icon path issues on load
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Sync Google Map layer (Roadmap vs Hybrid/Satellite)
  useEffect(() => {
    if (!mapRef.current) return;

    if (tileLayerRef.current) {
      tileLayerRef.current.remove();
    }

    // Google Maps Layers:
    // m = Roadmap, s = Satellite, y = Hybrid (Satellite + Labels), p = Terrain
    const url = mapType === 'roadmap'
      ? 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}'
      : 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';

    tileLayerRef.current = L.tileLayer(url, {
      maxZoom: 20,
      attribution: 'Map data &copy; Google Maps'
    }).addTo(mapRef.current);
  }, [mapType]);

  // Handle map FlyTo selected truck
  useEffect(() => {
    if (!mapRef.current || !selectedTruckId) return;

    const truck = trucks.find(t => t.id === selectedTruckId);
    if (truck) {
      const [lat, lng] = truck.lat !== undefined && truck.lng !== undefined
        ? [truck.lat, truck.lng]
        : getLatLng(truck.coordinateX, truck.coordinateY);

      mapRef.current.flyTo([lat, lng], 11, {
        animate: true,
        duration: 1.0
      });
    }
  }, [selectedTruckId, trucks]);

  // Filter trucks based on inline map search query
  const filteredTrucks = trucks.filter(truck => {
    const term = searchQuery.toLowerCase();
    return (
      truck.plateNo.toLowerCase().includes(term) ||
      truck.route.toLowerCase().includes(term) ||
      truck.driverName.toLowerCase().includes(term)
    );
  });

  // Re-render markers and route polylines when trucks or selection changes
  useEffect(() => {
    if (!mapRef.current || !markersGroupRef.current || !routesGroupRef.current) return;

    // Clear old layers
    markersGroupRef.current.clearLayers();
    routesGroupRef.current.clearLayers();

    // 1. Plot TPCAP HQ station (Only TPCAP is kept as requested)
    const hqIcon = L.divIcon({
      className: 'custom-hq-marker',
      html: `
        <div class="relative flex items-center justify-center">
          <div class="absolute w-12 h-12 rounded-full bg-blue-600/15 border border-blue-600/35 animate-pulse"></div>
          <div class="absolute w-8 h-8 rounded-full bg-blue-600/25 border border-blue-600/50"></div>
          <div class="w-5.5 h-5.5 rounded-full bg-blue-800 border-2 border-white flex items-center justify-center shadow-md">
            <span class="w-2 h-2 rounded-full bg-white"></span>
          </div>
          <div class="absolute -top-7 bg-blue-900 text-white font-sans font-black text-[9px] px-2 py-0.5 rounded shadow-sm whitespace-nowrap border border-blue-700">
            🏢 TPCAP HQ
          </div>
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    L.marker([13.624926, 101.014618], { icon: hqIcon })
      .addTo(markersGroupRef.current)
      .bindPopup(`
        <div class="font-sans p-1">
          <p class="font-extrabold text-xs text-slate-800 mb-0.5">🏢 TPCAP HQ (บางพลี)</p>
          <p class="text-[10px] text-slate-500 font-mono leading-none">Lat: 13.624926, Lng: 101.014618</p>
        </div>
      `);

    // 2. Plot Active Truck Markers and Route Polylines
    filteredTrucks.forEach(truck => {
      const [lat, lng] = truck.lat !== undefined && truck.lng !== undefined
        ? [truck.lat, truck.lng]
        : getLatLng(truck.coordinateX, truck.coordinateY);

      const isSelected = selectedTruckId === truck.id;

      // Draw Polyline for Selected Truck
      if (isSelected) {
        const coordinates = truck.routePoints.map(pt => {
          const [pLat, pLng] = truck.lat !== undefined && truck.lng !== undefined && pt.x === truck.coordinateX && pt.y === truck.coordinateY
            ? [truck.lat, truck.lng]
            : getLatLng(pt.x, pt.y);
          return [pLat, pLng] as [number, number];
        });

        // Ensure current real-time GPS coordinate is the ending point
        coordinates[coordinates.length - 1] = [lat, lng];

        L.polyline(coordinates, {
          color: getStatusColor(truck.status),
          weight: 4,
          dashArray: truck.status === 'Delivered' ? undefined : '5, 5',
          opacity: 0.85
        }).addTo(routesGroupRef.current!);
      }

      // Configure Marker color & icon
      let markerBg = '#22c55e'; // Bright Green
      let statusIconHtml = '';

      if (truck.status === 'Offline') {
        markerBg = '#ef4444'; // Red
        statusIconHtml = `
          <svg class="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        `;
      } else if (truck.status === 'At_Area') {
        markerBg = '#0ea5e9'; // Blue
        statusIconHtml = `
          <svg class="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
          </svg>
        `;
      } else if (truck.status === 'Delivered') {
        markerBg = '#10b981'; // Green
        statusIconHtml = `
          <svg class="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        `;
      } else {
        // Traveling
        markerBg = '#f59e0b'; // Amber/Yellow
        statusIconHtml = `
          <svg class="w-3 h-3 text-white fill-current transform rotate-45" viewBox="0 0 24 24">
            <path d="M12 2L2 22l10-4 10 4z"></path>
          </svg>
        `;
      }

      // Custom DivIcon representation
      const truckIcon = L.divIcon({
        className: `custom-truck-marker-icon ${isSelected ? 'is-selected' : ''}`,
        html: `
          <div class="relative flex items-center justify-center cursor-pointer group">
            ${isSelected ? `
              <div class="absolute w-10 h-10 rounded-full border-2 border-dashed border-blue-600 animate-spin" style="animation-duration: 8s;"></div>
              <div class="absolute w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/30 animate-pulse"></div>
            ` : ''}
            
            <div class="w-7 h-7 rounded-full border-2 border-slate-900 shadow-md flex items-center justify-center transition-all hover:scale-115" style="background-color: ${markerBg};">
              ${statusIconHtml}
            </div>
            
            <!-- Tooltip banner -->
            <div class="absolute -top-7 bg-slate-950 text-white font-sans font-bold text-[8.5px] px-2 py-0.5 rounded shadow-lg whitespace-nowrap border border-slate-700 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50">
              ${truck.plateNo.split(' ')[0]} (${truck.speed} กม./ชม.)
            </div>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      L.marker([lat, lng], { icon: truckIcon })
        .addTo(markersGroupRef.current!)
        .on('click', () => {
          onSelectTruck(truck);
        });
    });

  }, [filteredTrucks, selectedTruckId, trucks]);

  const handleResetView = () => {
    if (mapRef.current) {
      mapRef.current.setView([13.624926, 101.014618], 9);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col h-[520px] relative" id="interactive-map-panel">
      {/* Map Header Control Overlay */}
      <div className="absolute top-3 left-3 right-3 z-[1000] flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-white/95 backdrop-blur-xs border border-slate-200 rounded-lg px-3.5 py-2.5 shadow-sm">
        <div className="flex items-center gap-2">
          <Compass className="w-4.5 h-4.5 text-[#1e3a8a] animate-spin-slow" />
          <div className="flex flex-col">
            <span className="font-sans font-extrabold text-[11px] text-slate-800 uppercase tracking-wider leading-none">
              Google Maps Live Control Tower
            </span>
            <span className="text-[9px] text-slate-400 font-bold mt-0.5 uppercase tracking-widest flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              ระบบตรวจการณ์จราจรและพิกัดสด
            </span>
          </div>
        </div>

        {/* Dynamic Controls */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {/* Map Type Toggle */}
          <button
            onClick={() => setMapType(mapType === 'roadmap' ? 'satellite' : 'roadmap')}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 hover:border-slate-400 text-slate-700 text-[10px] font-bold rounded cursor-pointer transition-all shadow-2xs"
            title="เปลี่ยนรูปแบบแผนที่"
          >
            <Layers className="w-3 h-3 text-blue-600" />
            <span>{mapType === 'roadmap' ? 'ดาวเทียม (Hybrid)' : 'แผนที่ถนน (Road)'}</span>
          </button>

          {/* Reset button */}
          <button
            onClick={handleResetView}
            className="p-1.5 bg-white hover:bg-slate-50 border border-slate-300 hover:border-slate-400 text-slate-600 rounded cursor-pointer transition-all shadow-2xs"
            title="จัดตำแหน่งเริ่มต้น"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          {/* Map search */}
          <div className="relative">
            <input
              type="text"
              placeholder="ค้นทะเบียน / คนขับ..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-white border border-slate-300 rounded px-2.5 py-1.5 pl-7 text-[10px] text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all font-sans font-semibold w-36"
            />
            <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-2.5" />
          </div>
        </div>
      </div>

      {/* Actual Map Container */}
      <div 
        ref={mapContainerRef} 
        className="flex-1 w-full h-full z-0 bg-slate-50"
        id="leaflet-map-element"
      />

      {/* Bottom overlay status legend */}
      <div className="absolute bottom-3 left-3 z-[1000] bg-white/95 backdrop-blur-xs border border-slate-200 rounded-lg p-2.5 text-[9.5px] font-sans text-slate-600 shadow-sm hidden md:block">
        <span className="font-extrabold text-slate-800 block mb-1">สัญลักษณ์สถานะรถยนต์ (Google Maps):</span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
            <span className="font-bold">🟡 เดินทางอยู่</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#0ea5e9] inline-block"></span>
            <span className="font-bold">🔵 ถึงเขต TPCAP</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
            <span className="font-bold">🟢 ส่งงานสำเร็จ</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-500 inline-block"></span>
            <span className="font-bold">🔴 GPS ขัดข้อง/ดับเครื่อง</span>
          </div>
        </div>
      </div>
    </div>
  );
}
