"use client";
import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Plus,
  LogIn,
  LogOut,
  Mail,
  Phone,
  MapPin,
  Crown,
  Medal,
  Star,
  Tent,
  Trash2,
  Sparkles,
  CheckCircle2,
  UserPlus,
  ChevronLeft,
  ChevronRight,
  Images,
} from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
// Use shared gallery components
import { ImageCarousel, Lightbox } from "@/components/ui/Gallery";

// --- Supabase ---
import { supabase } from "@/lib/supabaseClient";
import type { User as SupaUser } from "@supabase/supabase-js";

// --- Types ---
type Standard = "Bronze" | "Silver" | "Gold";

type Listing = {
  id: string;
  title: string;
  standard: Standard;
  location: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string | null;
  images: string[]; // public URLs
  createdAt: string; // ISO string from DB
  ownerEmail: string;
  ownerId?: string | null;
  isFeatured?: boolean;
};

type ListingRow = {
  id: string;
  title: string;
  standard: Standard;
  location: string;
  contact_name: string;
  contact_email: string;
  contact_phone?: string | null;
  images: string[] | null;
  created_at: string;
  owner_email: string;
  owner_id?: string | null;
  is_featured?: boolean;
};

type AppUser = {
  name: string;
  email: string;
  role: "admin" | "user";
  supaUser: SupaUser;
};

// --- Helpers ---
const PLACEHOLDER = "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=1600&auto=format&fit=crop";

const standardBadge = (standard: Standard) => {
  const base = "px-2 py-1 rounded-full text-xs font-semibold";
  switch (standard) {
    case "Gold":
      return <Badge className={`${base} bg-yellow-500/20 text-yellow-100 border-yellow-400/40`}>Gold</Badge>;
    case "Silver":
      return <Badge className={`${base} bg-slate-200/20 text-slate-100 border-slate-300/40`}>Silver</Badge>;
    default:
      return <Badge className={`${base} bg-orange-500/20 text-orange-100 border-orange-400/40`}>Bronze</Badge>;
  }
};

const iconForStandard = (standard: Standard) => {
  if (standard === "Gold") return <Crown className="w-5 h-5" />;
  if (standard === "Silver") return <Medal className="w-5 h-5" />;
  return <Star className="w-5 h-5" />;
};

const formatWhen = (iso: string) => {
  const ts = new Date(iso).getTime();
  return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(
    Math.round((ts - Date.now()) / (1000 * 60 * 60 * 24)),
    "day"
  );
};

const getListingImages = (l: Listing): string[] => (l.images?.length ? l.images : [PLACEHOLDER]);

// --- Main App ---
export default function CaravanSite() {

  const [user, setUser] = useState<AppUser | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [featuredId, setFeaturedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [standardFilter, setStandardFilter] = useState<"All" | Standard>("All");
  const [authOpen, setAuthOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  // Gallery lightbox
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxStart, setLightboxStart] = useState(0);


// Helper: load (or create) profile (name, role) for a given Supabase user
const loadProfileFor = async (supaUser: SupaUser): Promise<AppUser> => {
  const email = supaUser.email || "";
  const fallbackName = email ? email.split("@")[0] : "User";

  // 1) Try to read existing profile
  let { data: profile, error } = await supabase
    .from("profiles")
    .select("name, role")
    .eq("id", supaUser.id)
    .maybeSingle();

  // 2) If missing, create it now (we are authenticated here)
  if (!profile) {
    const { error: upErr } = await supabase
      .from("profiles")
      .upsert(
        {
          id: supaUser.id,
          name: fallbackName,   // or pull from user_metadata if you prefer
          role: "user",         // default; you can change to "admin" in the DB
        },
        { onConflict: "id" }
      );

    if (upErr) {
      console.warn("profiles upsert error:", upErr);
    } else {
      // fetch again after creating
      const res = await supabase
        .from("profiles")
        .select("name, role")
        .eq("id", supaUser.id)
        .maybeSingle();
      profile = res.data || null;
      error = res.error || null;
    }
  }

  if (error) {
    console.warn("profiles fetch error:", error);
  }

  const name = profile?.name || fallbackName;
  const rawRole = (profile?.role ?? "user").toString().trim().toLowerCase();
  const role: "admin" | "user" = rawRole === "admin" ? "admin" : "user";

  console.log("Loaded profile role:", profile?.role);
  return { name, email, role, supaUser };
};

  // --- bootstrap from Supabase ---
  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        const appUser = await loadProfileFor(session.user);
        setUser(appUser);
      }

      await refreshListings();
      await loadFeatured();

      // listen to auth changes
      const { data: sub } = supabase.auth.onAuthStateChange(async (_evt, sess) => {
        if (sess?.user) {
          const appUser = await loadProfileFor(sess.user);
          setUser(appUser);
        } else {
          setUser(null);
        }
      });

      // realtime listings
      const channel = supabase
        .channel("public:listings")
        .on("postgres_changes", { event: "*", schema: "public", table: "listings" }, () =>
          refreshListings()
        )
        .subscribe();

      return () => {
        sub.subscription.unsubscribe();
        supabase.removeChannel(channel);
      };
    })();
  }, []);

  const refreshListings = async () => {
    const { data, error } = await supabase
      .from("listings")
      .select(
        `id, title, standard, location, contact_name, contact_email, contact_phone, images, created_at, owner_email, owner_id, is_featured`
      )
      .order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      return;
    }
    const mapped: Listing[] = (data as ListingRow[] | null)?.map((r) => ({
      id: r.id,
      title: r.title,
      standard: r.standard,
      location: r.location,
      contactName: r.contact_name,
      contactEmail: r.contact_email,
      contactPhone: r.contact_phone,
      images: r.images ?? [],
      createdAt: r.created_at,
      ownerEmail: r.owner_email,
      ownerId: r.owner_id,
      isFeatured: r.is_featured,
    })) ?? [];
    setListings(mapped);
  };

  const loadFeatured = async () => {
    const { data, error } = await supabase
      .from("listings")
      .select("id")
      .eq("is_featured", true)
      .limit(1)
      .maybeSingle();
    if (error && error.code !== "PGRST116") console.error(error);
    setFeaturedId(data?.id ?? null);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return listings
      .filter((l) => (standardFilter === "All" ? true : l.standard === standardFilter))
      .filter((l) =>
        q.length === 0
          ? true
          : [l.title, l.location, l.contactName, l.contactEmail].some((x) => x.toLowerCase().includes(q))
      );
  }, [listings, query, standardFilter]);

  const featured = useMemo(() => listings.find((l) => l.id === featuredId) || null, [listings, featuredId]);

  // --- Handlers ---
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const handleAddListing = async (l: Omit<Listing, "id" | "createdAt" | "ownerEmail">) => {
    const { error } = await supabase.from("listings").insert({
      title: l.title,
      standard: l.standard,
      location: l.location,
      contact_name: l.contactName,
      contact_email: l.contactEmail,
      contact_phone: l.contactPhone ?? null,
      images: l.images,
      owner_email: user?.email,
      owner_id: user?.supaUser.id,
    });
    if (error) {
      console.error(error);
      return;
    }
    await refreshListings();
    setAddOpen(false);
  };

  const deleteListing = async (id: string) => {
    // Optional: also delete images from storage
    const target = listings.find((x) => x.id === id);
    if (target?.images?.length) {
      const keys = target.images
        .map((url) => {
          const idx = url.indexOf("/object/public/");
          if (idx === -1) return null;
          return url.substring(idx + "/object/public/".length); // bucket/key
        })
        .filter(Boolean) as string[];
      // filter for our bucket
      const inBucket = keys.filter((k) => k.startsWith("listing-images/"));
      if (inBucket.length) {
        await supabase.storage.from("listing-images").remove(inBucket.map((k) => k.replace("listing-images/", "")));
      }
    }
    await supabase.from("listings").delete().eq("id", id);
    if (featuredId === id) setFeaturedId(null);
    await refreshListings();
  };

  const makeFeatured = async (id: string) => {
    // Ensure only one featured
    await supabase.from("listings").update({ is_featured: false }).eq("is_featured", true);
    const { error } = await supabase.from("listings").update({ is_featured: true }).eq("id", id);
    if (error) console.error(error);
    setFeaturedId(id);
    await refreshListings();
  };

  const openGallery = (imgs: string[], startAt = 0) => {
    setLightboxImages(imgs.length ? imgs : [PLACEHOLDER]);
    setLightboxStart(startAt);
    setLightboxOpen(true);
  };

  return (
    
    <div className="min-h-screen bg-gradient-to-b from-blue-900 via-blue-950 to-black text-slate-100">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 backdrop-blur supports-[backdrop-filter]:bg-blue-900/60 bg-blue-900/50 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-blue-500/20 border border-blue-400/30">
              <Tent className="w-5 h-5" />
            </div>
            <span className="text-lg font-semibold tracking-wide">CaravanHub</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2">
              <Input
                placeholder="Search caravans, locations, owners..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-80 bg-blue-900/40 border-blue-400/30 focus-visible:ring-blue-400 text-slate-100 placeholder:text-slate-400"
              />
              <Button
                variant="secondary"
                className="bg-blue-600 hover:bg-blue-500 border border-blue-300/40 text-slate-100"
              >
                <Search className="w-4 h-4 mr-2" />
                Search
              </Button>
            </div>

            {user ? (
              <div className="flex items-center gap-2">
                <Dialog open={addOpen} onOpenChange={setAddOpen}>
                  <DialogTrigger asChild>
                    <Button className="bg-blue-600 hover:bg-blue-500 border border-blue-300/40 text-slate-100">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Listing
                    </Button>
                  </DialogTrigger>
                  <AddListingDialog onAdd={handleAddListing} supaUserId={user.supaUser.id} />
                </Dialog>
                <Button variant="ghost" onClick={handleSignOut} className="text-slate-200 hover:text-white">
                  <LogOut className="w-4 h-4 mr-2" /> Sign out
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Dialog open={authOpen} onOpenChange={setAuthOpen}>
                  <DialogTrigger asChild>
                    <Button className="bg-blue-600 hover:bg-blue-500 border border-blue-300/40 text-slate-100">
                      <LogIn className="w-4 h-4 mr-2" /> Sign in
                    </Button>
                  </DialogTrigger>
                  <AuthDialog
                    onSignedIn={(u) => {
                      setUser(u);
                      setAuthOpen(false);
                    }}
                    loadProfileFor={loadProfileFor}
                  />
                </Dialog>
                <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
                  <DialogTrigger asChild>
                    <Button
                      variant="secondary"
                      className="border border-blue-300/40 text-slate-100 bg-blue-900/40 hover:bg-blue-800/60"
                    >
                      <UserPlus className="w-4 h-4 mr-2" /> Register
                    </Button>
                  </DialogTrigger>
                  <RegisterDialog
                    onRegistered={(u) => {
                      setRegisterOpen(false);
                      if (u) setUser(u);
                    }}
                  />
                </Dialog>
              </div>
            )}
          </div>
        </div>
      </nav>
      {/* Logged-in chip under navbar, aligned right */}
      {user && (
        <div className="max-w-6xl mx-auto px-4 pt-3">
          <div className="flex justify-end">
            <div className="inline-flex items-center gap-2 rounded-lg bg-blue-900/40 border border-blue-400/30 px-3 py-1.5 text-xs md:text-sm text-blue-100">
              <span className="opacity-80">Logged in as</span>
              <span className="font-semibold text-white">{user.name}</span>
              {user.role === "admin" && (
                <Badge className="ml-1 bg-blue-500/20 border-blue-300/40 text-blue-100">Admin</Badge>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Hero */}
      <header className="relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 py-12 md:py-16">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <h1 className="text-3xl md:text-5xl font-extrabold leading-tight text-white">
                Promote & Share Your <span className="text-blue-300">Caravan</span>
              </h1>
              <p className="mt-3 text-blue-100/80 max-w-prose">
                A clean, modern, blue-themed site to showcase caravans from Bronze to Gold. For now, each listing
                highlights contact details so guests can reach out directly.  And Caravan owners can directly advertise to their
                customers with ease.
              </p>
              <div className="mt-6 flex items-center gap-3">
                <Button
                  onClick={() => setAddOpen(true)}
                  className="bg-blue-600 hover:bg-blue-500 text-slate-100"
                  disabled={!user}
                >
                  <Plus className="w-4 h-4 mr-2" /> Add your caravan
                </Button>
                {!user && <p className="text-sm text-blue-100/70">Sign in or register to create a listing.</p>}
              </div>
            </div>
            <div className="relative">
              <div className="absolute -inset-8 bg-blue-700/20 blur-3xl rounded-full" />
              <Card className="relative bg-blue-900/40 border-blue-500/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-slate-100">
                    <Sparkles className="w-5 h-5" /> Featured {featured ? `– ${featured.title}` : "– Pick a listing"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-xl overflow-hidden">
                    <ImageCarousel
                      images={featured ? getListingImages(featured) : [PLACEHOLDER]}
                      openLightbox={(i) => featured && openGallery(getListingImages(featured), i)}
                    />
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-sm text-blue-100/80">
                    <MapPin className="w-4 h-4" /> {featured ? featured.location : "Whitby, North Yorkshire"}
                  </div>
                </CardContent>
              </Card>
              {user?.role === "admin" && (
                <p className="mt-2 text-xs text-blue-100/70">Tip: Use the “Feature” button on any card below.</p>
              )}
            </div>
          </div>
        </div>
        <Separator className="bg-blue-700/30" />
      </header>

      {/* Filters */}
      <section className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <Tabs value={standardFilter} onValueChange={(v) => setStandardFilter(v as Standard | "All")} className="w-full md:w-auto">
            <TabsList className="bg-blue-900/40 border border-blue-400/30">
  <TabsTrigger
    value="All"
    className="text-slate-200 data-[state=active]:bg-blue-700 data-[state=active]:text-white"
  >
    All
  </TabsTrigger>
  <TabsTrigger
    value="Bronze"
    className="text-slate-200 data-[state=active]:bg-blue-700 data-[state=active]:text-white"
  >
    Bronze
  </TabsTrigger>
  <TabsTrigger
    value="Silver"
    className="text-slate-200 data-[state=active]:bg-blue-700 data-[state=active]:text-white"
  >
    Silver
  </TabsTrigger>
  <TabsTrigger
    value="Gold"
    className="text-slate-200 data-[state=active]:bg-blue-700 data-[state=active]:text-white"
  >
    Gold
  </TabsTrigger>
</TabsList>

          </Tabs>
          <div className="flex items-center gap-2 md:hidden w-full">
            <Input
              placeholder="Search caravans, locations, owners..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-blue-900/40 border-blue-400/30 focus-visible:ring-blue-400 text-slate-100 placeholder:text-slate-400"
            />
            <Button
              variant="secondary"
              className="bg-blue-600 hover:bg-blue-500 border border-blue-300/40 text-slate-100"
            >
              <Search className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* Listings */}
      <main className="max-w-6xl mx-auto px-4 pb-16">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {filtered.map((l) => {
              const imgs = getListingImages(l);
              return (
                <motion.div
                  key={l.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25 }}
                >
                  <Card
                    className={`h-full bg-blue-900/40 border-blue-500/30 overflow-hidden flex flex-col ${
                      l.isFeatured ? "ring-2 ring-blue-300/60" : ""
                    }`}
                  >
                    <div className="relative w-full">
                      <ImageCarousel images={imgs} openLightbox={(i) => openGallery(imgs, i)} />
                      {imgs.length > 1 && (
                        <div className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-xs text-white">
                          <Images className="w-3 h-3" /> {imgs.length} photos
                        </div>
                      )}
                    </div>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center justify-between gap-2 text-base text-slate-100">
                        <span className="truncate" title={l.title}>
                          {l.title}
                        </span>
                        <span className="flex items-center gap-1 text-yellow-200/90">
                          {iconForStandard(l.standard)} {standardBadge(l.standard)}
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-blue-100/80 flex-1">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" /> {l.location}
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-1">
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4" />
                          <a className="underline hover:text-white" href={`mailto:${l.contactEmail}`}>
                            {l.contactEmail}
                          </a>
                        </div>
                        {l.contactPhone && (
                          <div className="flex items-center gap-2">
                            <Phone className="w-4 h-4" />
                            <a className="underline hover:text-white" href={`tel:${l.contactPhone}`}>
                              {l.contactPhone}
                            </a>
                          </div>
                        )}
                        <div className="text-xs opacity-70 mt-2">Listed {formatWhen(l.createdAt)}</div>
                      </div>
                    </CardContent>
                    <CardFooter className="pt-0 flex gap-2">
                      <Button
                        asChild
                        variant="secondary"
                        className="flex-1 bg-blue-700/60 hover:bg-blue-700 border border-blue-300/30 text-slate-100"
                      >
                        <a href={`mailto:${l.contactEmail}?subject=Enquiry about ${encodeURIComponent(l.title)}`}>
                          Contact Owner
                        </a>
                      </Button>
                      {user?.role === "admin" && (
                        <>
                          <Button
                            variant={l.isFeatured ? "secondary" : "default"}
                            className={`border border-blue-300/30 ${
                              l.isFeatured
                                ? "bg-blue-700/60 text-slate-100"
                                : "bg-blue-600 hover:bg-blue-500 text-slate-100"
                            }`}
                            onClick={() => makeFeatured(l.id)}
                            title="Set as featured"
                          >
                            {l.isFeatured ? (
                              <>
                                <CheckCircle2 className="w-4 h-4 mr-1" /> Featured
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-4 h-4 mr-1" /> Feature
                              </>
                            )}
                          </Button>
                          <Button
                            variant="destructive"
                            className="bg-red-600/80 hover:bg-red-600 text-white"
                            onClick={() => deleteListing(l.id)}
                          >
                            <Trash2 className="w-4 h-4 mr-1" /> Delete
                          </Button>
                        </>
                      )}
                    </CardFooter>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-20 text-blue-100/70">
            No listings yet. {user ? "Add your first caravan!" : "Sign in to add a listing."}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-10 text-sm text-blue-100/70 flex flex-col md:flex-row gap-4 md:items-center justify-between">
          <p>© {new Date().getFullYear()} CaravanHub. Built for showcasing and contact-only enquiries.
              To contact the administrator of this page please email: coreyyule22@gmail.com</p>
          <div className="flex items-center gap-2">
            <span className="opacity-70">Standards:</span>
            <span className="flex items-center gap-1">{standardBadge("Bronze")}</span>
            <span className="flex items-center gap-1">{standardBadge("Silver")}</span>
            <span className="flex items-center gap-1">{standardBadge("Gold")}</span>
          </div>
        </div>
      </footer>

      {/* Global Lightbox */}
      <Lightbox images={lightboxImages} open={lightboxOpen} startIndex={lightboxStart} onOpenChange={setLightboxOpen} />
    </div>
  );
}

// --- Auth Dialog (Supabase) ---
function AuthDialog({
  onSignedIn,
  loadProfileFor,
}: {
  onSignedIn: (u: AppUser) => void;
  loadProfileFor: (s: SupaUser) => Promise<AppUser>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

   const handle = async () => {
    setErr(null);
    if (!email || !password) {
      setErr("Please enter your email and password.");
      return;
    }
    try {
      setBusy(true);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const suser = data.user!;
      const appUser = await loadProfileFor(suser);
      onSignedIn(appUser);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Sign in failed";
      setErr(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogContent className="bg-blue-950 border-blue-500/30 text-slate-100">
      <DialogHeader>
        <DialogTitle className="text-slate-100">Sign in</DialogTitle>
        <DialogDescription className="text-blue-100/70">
          Sign in with your Supabase email/password.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-4">
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="email" className="text-right text-slate-200">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="col-span-3 bg-blue-900/40 border-blue-400/30 text-slate-100 placeholder:text-slate-400"
          />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="password" className="text-right text-slate-200">
            Password
          </Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="col-span-3 bg-blue-900/40 border-blue-400/30 text-slate-100 placeholder:text-slate-400"
          />
        </div>
        {err && <p className="text-red-300 text-sm">{err}</p>}
      </div>
      <DialogFooter>
        <Button onClick={handle} disabled={busy} className="bg-blue-600 hover:bg-blue-500 text-slate-100">
          {busy ? "Signing in..." : "Continue"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// --- Register Dialog (Supabase) ---
function RegisterDialog({ onRegistered }: { onRegistered: (u: AppUser | null) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const handleRegister = async () => {
    setErr(null);
    setOk(null);
    if (!email || !password || !name) {
      setErr("Please fill name, email, and password.");
      return;
    }
     try {
      setBusy(true);
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (error) throw error;

      // Create / update profile row for this user (RLS should allow: id = auth.uid())
      if (data.user) {
        const { error: upErr } = await supabase
          .from("profiles")
          .upsert(
            { id: data.user.id, name, role: "user" },
            { onConflict: "id" }
          );
        if (upErr) {
          // Not fatal; they can still sign in and profile can be created later
          console.warn("profiles upsert warning:", upErr);
        }
      }

      setOk("Check your inbox to confirm your email.");
      if (data.user) {
        onRegistered({ name, email, role: "user", supaUser: data.user });
      } else {
        onRegistered(null);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Registration failed";
      setErr(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogContent className="bg-blue-950 border-blue-500/30 text-slate-100">
      <DialogHeader>
        <DialogTitle className="text-slate-100">Create an account</DialogTitle>
        <DialogDescription className="text-blue-100/70">
          Supabase email/password auth. Your role is managed in the database.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-4">
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="rname" className="text-right text-slate-200">
            Name
          </Label>
          <Input
            id="rname"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="col-span-3 bg-blue-900/40 border-blue-400/30 text-slate-100 placeholder:text-slate-400"
          />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="remail" className="text-right text-slate-200">
            Email
          </Label>
          <Input
            id="remail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="col-span-3 bg-blue-900/40 border-blue-400/30 text-slate-100 placeholder:text-slate-400"
          />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="rpass" className="text-right text-slate-200">
            Password
          </Label>
          <Input
            id="rpass"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="col-span-3 bg-blue-900/40 border-blue-400/30 text-slate-100 placeholder:text-slate-400"
          />
        </div>
        {err && <p className="text-red-300 text-sm">{err}</p>}
        {ok && <p className="text-green-300 text-sm">{ok}</p>}
      </div>
      <DialogFooter>
        <Button onClick={handleRegister} disabled={busy} className="bg-blue-600 hover:bg-blue-500 text-slate-100">
          {busy ? "Registering..." : "Register"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// --- Add Listing Dialog (uploads to Supabase Storage + inserts row) ---
function AddListingDialog({
  onAdd,
  supaUserId,
}: {
  onAdd: (l: Omit<Listing, "id" | "createdAt" | "ownerEmail">) => void;
  supaUserId: string;
}) {
  const [title, setTitle] = useState("");
  const [standard, setStandard] = useState<Standard>("Bronze");
  const [location, setLocation] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const [previews, setPreviews] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [imageErr, setImageErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p)), [previews]);

  const canSave = title && location && contactName && contactEmail;

  const handleFiles = (fileList: FileList | null) => {
    setImageErr(null);
    if (!fileList || fileList.length === 0) {
      setPreviews([]);
      setFiles([]);
      return;
    }
    const arr = Array.from(fileList).slice(0, 10);
    previews.forEach((p) => URL.revokeObjectURL(p));
    setPreviews(arr.map((f) => URL.createObjectURL(f)));
    setFiles(arr);
  };

  const removeImage = (idx: number) => {
    setFiles((arr) => arr.filter((_, i) => i !== idx));
    setPreviews((arr) => {
      const c = [...arr];
      const [rm] = c.splice(idx, 1);
      if (rm) URL.revokeObjectURL(rm);
      return c;
    });
  };

  const moveImage = (idx: number, dir: -1 | 1) => {
    setFiles((arr) => {
      const c = [...arr];
      const ni = idx + dir;
      if (ni < 0 || ni >= c.length) return c;
      [c[idx], c[ni]] = [c[ni], c[idx]];
      return c;
    });
    setPreviews((arr) => {
      const c = [...arr];
      const ni = idx + dir;
      if (ni < 0 || ni >= c.length) return c;
      [c[idx], c[ni]] = [c[ni], c[idx]];
      return c;
    });
  };

  const uploadAll = async (): Promise<string[]> => {
    const urls: string[] = [];
    for (const f of files) {
      const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${supaUserId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("listing-images").upload(path, f, {
        upsert: true,
        contentType: f.type,
        cacheControl: "3600",
      });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("listing-images").getPublicUrl(path);
      urls.push(data.publicUrl);
    }
    return urls;
  };

   const handleSave = async () => {
    if (!canSave) return;
    try {
      setBusy(true);
      setImageErr(null);
      const imageUrls = files.length ? await uploadAll() : [];
      onAdd({
        title,
        standard,
        location,
        contactName,
        contactEmail,
        contactPhone: contactPhone || null,
        images: imageUrls,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to save listing";
      setImageErr(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogContent className="max-w-2xl bg-blue-950 border-blue-500/30 text-slate-100">
      <DialogHeader>
        <DialogTitle className="text-slate-100">Add a new caravan</DialogTitle>
        <DialogDescription className="text-blue-100/70">
          Upload to Supabase Storage; first image becomes cover.
        </DialogDescription>
      </DialogHeader>
      <div className="grid md:grid-cols-2 gap-4 py-2">
        <div className="space-y-2">
          <Label htmlFor="title" className="text-slate-200">
            Title
          </Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-blue-900/40 border-blue-400/30 text-slate-100 placeholder:text-slate-400"
            placeholder="e.g., Family Caravan by the Sea"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-slate-200">Standard</Label>
          <Select value={standard} onValueChange={(v) => setStandard(v as Standard)}>
            <SelectTrigger className="bg-blue-900/40 border-blue-400/30 text-slate-100">
              <SelectValue placeholder="Choose standard" />
            </SelectTrigger>
            <SelectContent className="bg-blue-950 border-blue-500/30 text-slate-100">
              <SelectItem value="Bronze">Bronze</SelectItem>
              <SelectItem value="Silver">Silver</SelectItem>
              <SelectItem value="Gold">Gold</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="location" className="text-slate-200">
            Location
          </Label>
          <Input
            id="location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="bg-blue-900/40 border-blue-400/30 text-slate-100 placeholder:text-slate-400"
            placeholder="Town / Park / County"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cname" className="text-slate-200">
            Contact Name
          </Label>
          <Input
            id="cname"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            className="bg-blue-900/40 border-blue-400/30 text-slate-100 placeholder:text-slate-400"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cemail" className="text-slate-200">
            Contact Email
          </Label>
          <Input
            id="cemail"
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            className="bg-blue-900/40 border-blue-400/30 text-slate-100 placeholder:text-slate-400"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cphone" className="text-slate-200">
            Contact Phone (optional)
          </Label>
          <Input
            id="cphone"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            className="bg-blue-900/40 border-blue-400/30 text-slate-100 placeholder:text-slate-400"
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="imgFiles" className="text-slate-200">
            Images (upload up to 10)
          </Label>
          <Input
            id="imgFiles"
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => handleFiles(e.target.files)}
            className="bg-blue-900/40 border-blue-400/30 file:text-slate-200 text-slate-100"
          />
          {imageErr && <p className="text-xs text-red-300">{imageErr}</p>}
          {previews.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {previews.map((p, i) => (
                <div key={i} className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p}
                    alt={`preview-${i}`}
                    className="h-24 w-full object-cover rounded-lg border border-blue-400/20"
                  />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2 rounded-lg">
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-7 w-7"
                      onClick={() => moveImage(i, -1)}
                      disabled={i === 0}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-7 w-7"
                      onClick={() => moveImage(i, 1)}
                      disabled={i === previews.length - 1}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="destructive" className="h-7 w-7" onClick={() => removeImage(i)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <DialogFooter>
        <Button
          onClick={handleSave}
          disabled={!canSave || busy}
          className="bg-blue-600 hover:bg-blue-500 text-slate-100"
        >
          {busy ? "Saving..." : "Save listing"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// --- Dev Self-Checks ---
function runSelfChecks(): void {
  if (process.env.NODE_ENV !== "development") return;
  try {
    const today = formatWhen(new Date().toISOString());
    const yday = formatWhen(new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString());
    console.assert(typeof today === "string" && typeof yday === "string");
  } catch (e) {
    console.warn("Self-checks failed:", e);
  }

}
