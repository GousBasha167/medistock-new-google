import React from 'react';

export const MediStockLogo: React.FC<{ size?: 'sm' | 'md' | 'lg'; showTagline?: boolean }> = ({
  size = 'md',
  showTagline = false,
}) => {
  const iconSize = size === 'sm' ? 'w-7 h-7' : size === 'lg' ? 'w-11 h-11' : 'w-9 h-9';
  const textSize =
    size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-3xl' : 'text-xl';

  return (
    <div className="inline-flex flex-col">
      <div className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0">
        <svg
          className={iconSize}
          viewBox="0 0 64 64"
          fill="none"
          aria-hidden="true"
        >
          <g transform="translate(32 32) rotate(-45) translate(-32 -32)">
            <path
              d="M20 18C20 11.3726 25.3726 6 32 6C38.6274 6 44 11.3726 44 18V32H20V18Z"
              fill="#245DB5"
            />
            <path
              d="M20 32H44V46C44 52.6274 38.6274 58 32 58C25.3726 58 20 52.6274 20 46V32Z"
              fill="#16866B"
            />
            <path
              d="M25 18C25 14.134 28.134 11 32 11"
              stroke="#93C5FD"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <rect x="20" y="31" width="24" height="2" fill="#183153" fillOpacity="0.2" />
          </g>
        </svg>
        <span className={`font-display font-bold tracking-tight ${textSize}`}>
          <span className="text-[#183153] dark:text-white">Medi</span>
          <span className="text-[#16866B] dark:text-emerald-400">Stock</span>
        </span>
      </div>
      {showTagline && (
        <p className="mt-1.5 text-sm font-semibold text-[#183153] dark:text-slate-200">
          Never run out of medicines.
        </p>
      )}
    </div>
  );
};

export const FamilyHealthIllustration: React.FC<{ className?: string }> = ({
  className = 'w-full max-w-[340px] h-auto',
}) => (
  <svg
    viewBox="0 0 360 250"
    fill="none"
    className={className}
    role="img"
    aria-label="Illustration of smiling elderly grandparents with a family medicine kit"
  >
    {/* Soft circular backdrop */}
    <ellipse cx="180" cy="145" rx="145" ry="92" fill="#DCEBFB" fillOpacity="0.7" />
    {/* Subtle decorative healthcare crosses */}
    <path d="M56 54v12M50 60h12" stroke="#93C5FD" strokeWidth="3" strokeLinecap="round" />
    <path d="M302 48v12M296 54h12" stroke="#86EFAC" strokeWidth="3" strokeLinecap="round" />
    <path d="M316 142v10M311 147h10" stroke="#93C5FD" strokeWidth="2.5" strokeLinecap="round" />

    {/* Botanical leaves left */}
    <path
      d="M84 198C56 174 44 142 54 108C76 124 92 152 96 198H84Z"
      fill="#A7D7C5"
    />
    <path
      d="M72 200C40 186 24 162 28 134C50 144 68 168 78 200H72Z"
      fill="#7EC4AE"
    />
    {/* Botanical leaves right */}
    <path
      d="M276 198C304 174 316 142 306 108C284 124 268 152 264 198H276Z"
      fill="#A7D7C5"
    />
    <path
      d="M288 200C320 186 336 162 332 134C310 144 292 168 282 200H288Z"
      fill="#7EC4AE"
    />

    {/* Grandfather (left) */}
    <g>
      {/* Shoulders / Sweater */}
      <path
        d="M84 206C84 168 106 146 138 146C170 146 192 168 192 206H84Z"
        fill="#3B6EB5"
      />
      {/* Shirt collar */}
      <path d="M124 146L138 164L152 146H124Z" fill="#FFFFFF" />
      {/* Neck */}
      <rect x="129" y="130" width="18" height="20" rx="8" fill="#F3C3A3" />
      {/* Hair back/sides */}
      <circle cx="110" cy="100" r="10" fill="#E2E8F0" />
      <circle cx="166" cy="100" r="10" fill="#E2E8F0" />
      {/* Head */}
      <circle cx="138" cy="104" r="30" fill="#FAD2B8" />
      {/* Hair top */}
      <path
        d="M108 100C108 80 122 70 138 70C154 70 168 80 168 100C160 88 150 84 138 84C126 84 116 88 108 100Z"
        fill="#E2E8F0"
      />
      {/* Glasses */}
      <circle cx="126" cy="104" r="9.5" stroke="#183153" strokeWidth="2.5" fill="#FFFFFF" fillOpacity="0.35" />
      <circle cx="150" cy="104" r="9.5" stroke="#183153" strokeWidth="2.5" fill="#FFFFFF" fillOpacity="0.35" />
      <line x1="135.5" y1="104" x2="140.5" y2="104" stroke="#183153" strokeWidth="2.5" />
      {/* Eyes */}
      <circle cx="126" cy="104" r="2.2" fill="#183153" />
      <circle cx="150" cy="104" r="2.2" fill="#183153" />
      {/* Mustache & Smile */}
      <path d="M126 116C131 112 135 113 138 115C141 113 145 112 150 116" stroke="#CBD5E1" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M132 121C135 124 141 124 144 121" stroke="#C2785C" strokeWidth="2" strokeLinecap="round" />
    </g>

    {/* Grandmother (right) */}
    <g>
      {/* Hair bun */}
      <circle cx="226" cy="70" r="15" fill="#CBD5E1" />
      {/* Shoulders / Cardigan */}
      <path
        d="M174 206C174 170 194 150 226 150C258 150 278 170 278 206H174Z"
        fill="#2C8C78"
      />
      {/* Necklace */}
      <path d="M210 152C216 162 236 162 242 152" stroke="#F8FAFC" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 5" />
      {/* Neck */}
      <rect x="218" y="134" width="16" height="20" rx="8" fill="#F3C3A3" />
      {/* Head */}
      <circle cx="226" cy="110" r="28" fill="#FAD2B8" />
      {/* Hair wave */}
      <path
        d="M198 106C198 86 211 76 226 76C241 76 254 86 254 106C246 95 236 92 226 92C216 92 206 95 198 106Z"
        fill="#E2E8F0"
      />
      {/* Glasses */}
      <circle cx="215" cy="110" r="8.5" stroke="#183153" strokeWidth="2.3" fill="#FFFFFF" fillOpacity="0.35" />
      <circle cx="237" cy="110" r="8.5" stroke="#183153" strokeWidth="2.3" fill="#FFFFFF" fillOpacity="0.35" />
      <line x1="223.5" y1="110" x2="228.5" y2="110" stroke="#183153" strokeWidth="2.3" />
      {/* Eyes */}
      <circle cx="215" cy="110" r="2" fill="#183153" />
      <circle cx="237" cy="110" r="2" fill="#183153" />
      {/* Smile */}
      <path d="M218 122C222 126 230 126 234 122" stroke="#C2785C" strokeWidth="2.2" strokeLinecap="round" />
    </g>

    {/* Medical First Aid Kit foreground */}
    <g>
      <path d="M164 176V170C164 166.686 166.686 164 170 164H190C193.314 164 196 166.686 196 170V176" stroke="#245DB5" strokeWidth="4" />
      <rect x="142" y="176" width="76" height="50" rx="10" fill="#5DA9E9" stroke="#FFFFFF" strokeWidth="3" />
      <circle cx="180" cy="201" r="14" fill="#FFFFFF" />
      <path d="M180 193V209M172 201H188" stroke="#245DB5" strokeWidth="4" strokeLinecap="round" />
      {/* Hands */}
      <circle cx="138" cy="200" r="7" fill="#FAD2B8" />
      <circle cx="222" cy="200" r="7" fill="#FAD2B8" />
    </g>
  </svg>
);
