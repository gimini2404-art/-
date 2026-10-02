"""Approximate country centroids (lat, lng) so collaborations can be placed on the map from the country name."""
COUNTRIES = {
    "egypt": (26.8, 30.8), "saudi arabia": (23.9, 45.1), "united arab emirates": (23.4, 53.8), "uae": (23.4, 53.8), "qatar": (25.3, 51.2),
    "kuwait": (29.3, 47.5), "bahrain": (26.0, 50.6), "oman": (21.5, 55.9), "jordan": (31.2, 36.5), "lebanon": (33.9, 35.9),
    "syria": (35.0, 38.5), "iraq": (33.2, 43.7), "yemen": (15.6, 48.5), "palestine": (31.9, 35.2), "israel": (31.0, 34.9),
    "turkey": (39.0, 35.2), "iran": (32.4, 53.7), "morocco": (31.8, -7.1), "algeria": (28.0, 1.7), "tunisia": (34.0, 9.5),
    "libya": (26.3, 17.2), "sudan": (12.9, 30.2), "south sudan": (6.9, 31.3), "somalia": (5.2, 46.2), "ethiopia": (9.1, 40.5),
    "kenya": (0.0, 37.9), "uganda": (1.4, 32.3), "tanzania": (-6.4, 34.9), "nigeria": (9.1, 8.7), "ghana": (7.9, -1.0),
    "senegal": (14.5, -14.5), "south africa": (-30.6, 22.9), "united kingdom": (55.4, -3.4), "uk": (55.4, -3.4), "ireland": (53.4, -8.2),
    "france": (46.2, 2.2), "germany": (51.2, 10.5), "italy": (41.9, 12.6), "spain": (40.5, -3.7), "portugal": (39.4, -8.2),
    "netherlands": (52.1, 5.3), "belgium": (50.5, 4.5), "switzerland": (46.8, 8.2), "austria": (47.5, 14.6), "sweden": (60.1, 18.6),
    "norway": (60.5, 8.5), "denmark": (56.3, 9.5), "finland": (61.9, 25.7), "poland": (51.9, 19.1), "greece": (39.1, 21.8),
    "russia": (61.5, 105.3), "ukraine": (48.4, 31.2), "united states": (37.1, -95.7), "usa": (37.1, -95.7), "canada": (56.1, -106.3),
    "mexico": (23.6, -102.6), "brazil": (-14.2, -51.9), "argentina": (-38.4, -63.6), "chile": (-35.7, -71.5), "colombia": (4.6, -74.3),
    "india": (20.6, 78.9), "pakistan": (30.4, 69.3), "bangladesh": (23.7, 90.4), "china": (35.9, 104.2), "japan": (36.2, 138.3),
    "south korea": (35.9, 127.8), "singapore": (1.35, 103.8), "malaysia": (4.2, 101.9), "indonesia": (-0.8, 113.9), "thailand": (15.9, 100.99),
    "vietnam": (14.1, 108.3), "philippines": (12.9, 121.8), "australia": (-25.3, 133.8), "new zealand": (-40.9, 174.9),
}
# Arabic names -> same coordinates
_AR = {"مصر": "egypt", "السعودية": "saudi arabia", "المملكة العربية السعودية": "saudi arabia", "الإمارات": "united arab emirates",
       "قطر": "qatar", "الكويت": "kuwait", "البحرين": "bahrain", "عُمان": "oman", "الأردن": "jordan", "لبنان": "lebanon",
       "العراق": "iraq", "تركيا": "turkey", "المغرب": "morocco", "الجزائر": "algeria", "تونس": "tunisia", "السودان": "sudan",
       "المملكة المتحدة": "united kingdom", "بريطانيا": "united kingdom", "فرنسا": "france", "ألمانيا": "germany",
       "الولايات المتحدة": "united states", "أمريكا": "united states", "كندا": "canada", "الهند": "india", "الصين": "china",
       "اليابان": "japan", "أستراليا": "australia", "إيطاليا": "italy", "إسبانيا": "spain", "هولندا": "netherlands", "سويسرا": "switzerland"}


def locate(country):
    key = (country or "").strip().lower()
    key = _AR.get(country.strip(), key) if country else key
    return COUNTRIES.get(key)
