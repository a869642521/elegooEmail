import Image from "next/image";

const brandLogoByKey: Record<string, string> = {
  apple: "https://n5su3bze2ea.b-cdn.net/brands/vb9o9fr26xe.png?width=128&height=128&aspect_ratio=128%3A128",
  dji: "https://n5su3bze2ea.b-cdn.net/brands/lk23rqff4im.jpg?width=128&height=128&aspect_ratio=128%3A128",
  insta360: "https://n5su3bze2ea.b-cdn.net/brands/9na8ox7hoe.jpg?width=128&height=128&aspect_ratio=128%3A128"
};

function normalizeBrandName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function BrandAvatar({ brandName }: { brandName: string }) {
  const logo = brandLogoByKey[normalizeBrandName(brandName)];

  return (
    <span className={`brand-avatar${logo ? " brand-avatar--image" : ""}`} aria-hidden="true">
      {logo ? (
        <Image src={logo} alt="" width={32} height={32} sizes="32px" unoptimized />
      ) : (
        brandName.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
