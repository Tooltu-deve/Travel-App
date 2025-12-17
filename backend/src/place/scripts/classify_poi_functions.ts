import * as fs from 'fs';
import * as path from 'path';

/**
 * Script để classify POI theo function dựa vào types
 * Đọc poi_location_details.json và poi_location_details_v2.json
 * Thêm field "function" vào mỗi POI
 */

// Type definition for function rules
type FunctionRule = {
  priority: number;
  includeInDailyRoute: boolean;
  keywords: string[];
  minPerDay?: number;
  maxPerDay?: number;
  maxPerTrip?: number;
  showAsRecommendation?: boolean;
  description?: string;
  exclusions?: string[];
  exceptions?: {
    ifHasAny: string[];
    thenReclassify: string;
  };
};

type POIFunctionRules = {
  [key: string]: FunctionRule;
};

// Định nghĩa POI Functions với priority và rules
const POI_FUNCTION_RULES: POIFunctionRules = {
  CORE_ATTRACTION: {
    priority: 1,
    includeInDailyRoute: true,
    minPerDay: 2,
    keywords: [
      'tourist_attraction',
      'landmark',
      'point_of_interest',
      'museum',
      'art_gallery',
      'historical_landmark',
      'temple',
      'church',
      'pagoda',
      'shrine',
      'place_of_worship',
      'mosque',
      'hindu_temple',
      'park',
      'natural_feature',
      'beach',
      'scenic',
      'viewpoint',
      'zoo',
      'aquarium',
      'amusement_park',
      'theme_park',
      'cultural_center',
      'monument',
      'castle',
      'fort',
      'archaeological_site',
      'world_heritage_site',
    ],
  },

  ACTIVITY: {
    priority: 2,
    includeInDailyRoute: true,
    maxPerDay: 2,
    keywords: [
      'shopping_mall',
      'market',
      'store',
      'shopping',
      'hiking_area',
      'garden',
      'botanical_garden',
      'theater',
      'cinema',
      'entertainment',
      'sports_complex',
      'stadium',
      'spa',
      'wellness',
    ],
  },

  RESORT: {
    priority: 3,
    includeInDailyRoute: true, // ✅ Resort có thể thăm trong ngày (beach, spa, activities)
    maxPerDay: 1,
    keywords: [
      'resort',
      'resort_hotel',
      'beach_resort',
      'vacation_resort',
    ],
    description: 'Resort với tiện ích du lịch (bãi biển, spa, vườn), có thể thăm trong ngày',
  },

  FOOD_BEVERAGE: {
    priority: 4,
    includeInDailyRoute: true,
    maxPerDay: 1,
    keywords: [
      'cafe',
      'coffee_shop',
      'bakery',
      'tea_house',
      'dessert_shop',
      'ice_cream',
    ],
    exclusions: [
      // Loại những POI chỉ là restaurant thuần túy
      'meal_takeaway',
      'meal_delivery',
    ],
  },

  ACCOMMODATION: {
    priority: 5,
    includeInDailyRoute: false, // ❗ KHÔNG bao gồm trong lộ trình ngày
    maxPerTrip: 2,
    showAsRecommendation: true,
    keywords: [
      'hotel',
      'lodging',
      'motel',
      'hostel',
      'guest_house',
      'apartment_complex',
      'serviced_apartment',
      'vacation_rental',
      'bed_and_breakfast',
    ],
  },

  NIGHTLIFE: {
    priority: 0,
    includeInDailyRoute: false,
    keywords: [
      'bar',
      'night_club',
      'casino',
      'wine_bar',
      'pub',
      'karaoke',
      'lounge',
      'nightclub',
      'cocktail_bar',
    ],
  },

  DINING: {
    priority: 4,
    includeInDailyRoute: true,
    maxPerDay: 1,
    keywords: ['restaurant', 'food', 'dining'],
    // Exception: Nếu có tourist_attraction → chuyển sang CORE_ATTRACTION
    exceptions: {
      ifHasAny: ['tourist_attraction', 'point_of_interest', 'cultural', 'museum'],
      thenReclassify: 'CORE_ATTRACTION',
    },
  },

  SUPPORT: {
    priority: 0,
    includeInDailyRoute: false,
    keywords: [
      'parking',
      'atm',
      'gas_station',
      'car_rental',
      'travel_agency',
      'bank',
      'post_office',
      'convenience_store',
      'supermarket',
      'pharmacy',
    ],
  },
};

interface POI {
  placeID: string;
  name: string;
  type?: string;
  types?: string[];
  function?: string;
  functionPriority?: number;
  includeInDailyRoute?: boolean;
  [key: string]: any;
}

/**
 * Lấy type của POI (chỉ dùng trường type, không dùng types)
 */
function getPOITypes(poi: POI): string[] {
  const types: string[] = [];

  if (poi.type && typeof poi.type === 'string') {
    types.push(poi.type.toLowerCase());
  }

  return types;
}

/**
 * Classify POI dựa vào types
 */
function classifyPOI(poi: POI): {
  function: string;
  priority: number;
  includeInDailyRoute: boolean;
} {
  const types = getPOITypes(poi);

  // Kiểm tra từng function theo thứ tự priority (cao → thấp)
  const sortedFunctions = Object.entries(POI_FUNCTION_RULES).sort(
    (a, b) => b[1].priority - a[1].priority,
  );

  for (const [functionName, rules] of sortedFunctions) {
    const keywords = rules.keywords || [];

    // Check nếu POI match với keywords
    const hasMatch = keywords.some((keyword) =>
      types.some((type) => type.includes(keyword) || keyword.includes(type)),
    );

    if (hasMatch) {
      // Check exclusions (nếu có)
      if (rules.exclusions) {
        const hasExclusion = rules.exclusions.some((excl) => types.includes(excl));
        if (hasExclusion) {
          continue; // Skip function này
        }
      }

      // Check exceptions (ví dụ: restaurant có tourist_attraction → CORE)
      if (rules.exceptions) {
        const hasException = rules.exceptions.ifHasAny.some((exType) =>
          types.includes(exType),
        );
        if (hasException) {
          const newFunction = rules.exceptions.thenReclassify;
          const newRules = POI_FUNCTION_RULES[newFunction];
          return {
            function: newFunction,
            priority: newRules.priority,
            includeInDailyRoute: newRules.includeInDailyRoute,
          };
        }
      }

      return {
        function: functionName,
        priority: rules.priority,
        includeInDailyRoute: rules.includeInDailyRoute,
      };
    }
  }

  // Default: CORE_ATTRACTION (optimistic)
  return {
    function: 'CORE_ATTRACTION',
    priority: 1,
    includeInDailyRoute: true,
  };
}

/**
 * Process một file JSON
 */
function processJSONFile(filePath: string): void {
  console.log(`\n📖 Processing: ${path.basename(filePath)}`);

  // Đọc file
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const pois: POI[] = JSON.parse(fileContent);

  console.log(`  → Found ${pois.length} POIs`);

  // Classify từng POI
  const stats: Record<string, number> = {};

  for (const poi of pois) {
    const classification = classifyPOI(poi);

    // Thêm fields
    poi.function = classification.function;
    poi.functionPriority = classification.priority;
    poi.includeInDailyRoute = classification.includeInDailyRoute;

    // Stats
    stats[classification.function] = (stats[classification.function] || 0) + 1;
  }

  // Lưu lại file (backup trước)
  const backupPath = filePath.replace('.json', '.backup.json');
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(filePath, backupPath);
    console.log(`  ✅ Backup created: ${path.basename(backupPath)}`);
  }

  fs.writeFileSync(filePath, JSON.stringify(pois, null, 2), 'utf-8');
  console.log(`  ✅ Updated: ${path.basename(filePath)}`);

  // In stats
  console.log(`\n  📊 Classification Stats:`);
  Object.entries(stats)
    .sort((a, b) => b[1] - a[1])
    .forEach(([func, count]) => {
      const percentage = ((count / pois.length) * 100).toFixed(1);
      console.log(`    ${func}: ${count} (${percentage}%)`);
    });
}

/**
 * Main function
 */
function main() {
  console.log('🚀 POI Function Classification Script');
  console.log('=====================================\n');

  const dataDir = path.join(__dirname, '../data');

  const files = [
    path.join(dataDir, 'poi_location_details.json'),
    path.join(dataDir, 'poi_location_details_v2.json'),
  ];

  for (const filePath of files) {
    if (fs.existsSync(filePath)) {
      processJSONFile(filePath);
    } else {
      console.log(`⚠️  File not found: ${filePath}`);
    }
  }

  console.log('\n✅ Classification completed!');
  console.log('\n💡 Next steps:');
  console.log('  1. Review the updated JSON files');
  console.log('  2. Update main.py to use "function" field');
  console.log('  3. Test with sample queries');
}

// Run
main();
