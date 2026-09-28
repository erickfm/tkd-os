-- Readable, consistent belt palette.
-- Every regular belt: saturated color + white text; "Sr." = a darker shade of the
-- same hue. White/Yellow keep dark text but get a visible border on the cream UI.
-- Black belts get a lighter gray border so they don't read as a dark smudge.
-- All combinations clear WCAG AA (>= 4.5:1).

-- White & Yellow (light belts: dark text, stronger border)
UPDATE belt_ranks SET color_hex='#FFFFFF', text_hex='#1F2937', border_hex='#9CA3AF' WHERE track='regular' AND sort_order=0;
UPDATE belt_ranks SET color_hex='#FACC15', text_hex='#422006', border_hex='#A16207' WHERE track='regular' AND sort_order=1;

-- Green / Sr. Green
UPDATE belt_ranks SET color_hex='#2E7D32', text_hex='#FFFFFF', border_hex='#1B5E20' WHERE track='regular' AND sort_order=2;
UPDATE belt_ranks SET color_hex='#1B5E20', text_hex='#FFFFFF', border_hex='#14532D' WHERE track='regular' AND sort_order=3;

-- Blue / Sr. Blue
UPDATE belt_ranks SET color_hex='#1D4ED8', text_hex='#FFFFFF', border_hex='#1E3A8A' WHERE track='regular' AND sort_order=4;
UPDATE belt_ranks SET color_hex='#1E3A8A', text_hex='#FFFFFF', border_hex='#172554' WHERE track='regular' AND sort_order=5;

-- Purple / Sr. Purple
UPDATE belt_ranks SET color_hex='#6D28D9', text_hex='#FFFFFF', border_hex='#4C1D95' WHERE track='regular' AND sort_order=6;
UPDATE belt_ranks SET color_hex='#4C1D95', text_hex='#FFFFFF', border_hex='#2E1065' WHERE track='regular' AND sort_order=7;

-- Brown L1-L3
UPDATE belt_ranks SET color_hex='#92400E', text_hex='#FFFFFF', border_hex='#5C2A09' WHERE track='regular' AND sort_order IN (8,9,10);

-- Red L1-L3
UPDATE belt_ranks SET color_hex='#B91C1C', text_hex='#FFFFFF', border_hex='#7F1D1D' WHERE track='regular' AND sort_order IN (11,12,13);

-- All Black degrees: rich black, white text, visible gray border
UPDATE belt_ranks SET color_hex='#18181B', text_hex='#FFFFFF', border_hex='#6B7280' WHERE track='regular' AND degree IS NOT NULL;
