import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Truck, MapPin, BarChart3, Users, Shield, Clock, ChevronRight, Sparkles, ArrowRight } from "lucide-react";

const partners = [
  { name: "Samsara", description: "Fleet Telematics" },
  { name: "Motive", description: "ELD & Compliance" },
  { name: "Highway", description: "Carrier Verification" },
  { name: "Trimble", description: "Transportation Solutions" },
  { name: "FMCSA", description: "Safety Compliance" },
  { name: "Mapbox", description: "Route Optimization" },
  { name: "Weather API", description: "Real-time Weather" },
  { name: "WhatsApp", description: "Driver Communication" },
];

const features = [
  {
    icon: Truck,
    title: "Fleet Management",
    description: "Track and manage your entire fleet in real-time with advanced telematics integration.",
  },
  {
    icon: MapPin,
    title: "Route Optimization",
    description: "Optimize routes for fuel efficiency and on-time delivery with smart planning tools.",
  },
  {
    icon: BarChart3,
    title: "Analytics & Reporting",
    description: "Gain insights with comprehensive analytics on loads, revenue, and fleet performance.",
  },
  {
    icon: Users,
    title: "Driver Management",
    description: "Streamline driver onboarding, compliance tracking, and performance management.",
  },
  {
    icon: Shield,
    title: "Compliance & Safety",
    description: "Stay compliant with FMCSA regulations and maintain safety ratings effortlessly.",
  },
  {
    icon: Clock,
    title: "Real-time Dispatch",
    description: "Dispatch loads instantly with automated matching and live tracking capabilities.",
  },
];

const Index = () => {
  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center">
                <Truck className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-lg sm:text-xl font-bold text-foreground hidden sm:inline">NexusTech Solution</span>
              <span className="text-lg font-bold text-foreground sm:hidden">NexusTech</span>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              <Link to="/apply">
                <Button variant="ghost" size="sm" className="text-xs sm:text-sm">
                  <span className="hidden sm:inline">Driver Application</span>
                  <span className="sm:hidden">Apply</span>
                </Button>
              </Link>
              <Link to="/auth">
                <Button size="sm" className="rounded-xl text-xs sm:text-sm shadow-sm">
                  <span className="hidden sm:inline">Admin Login</span>
                  <span className="sm:hidden">Login</span>
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="relative pt-24 sm:pt-32 pb-16 sm:pb-24 px-4 overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-primary/3 to-background pointer-events-none" />
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-3xl opacity-50 pointer-events-none" />
        
        <div className="relative max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Sparkles className="h-4 w-4" />
            <span>Modern Fleet Management</span>
          </div>
          
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-foreground mb-6 tracking-tight animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
            Transportation
            <span className="block text-primary">Management Software</span>
          </h1>
          
          <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8 sm:mb-10 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200 px-4">
            Streamline your trucking operations with our all-in-one platform. 
            From dispatch to delivery, manage your fleet with ease.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300 px-4">
            <Link to="/auth">
              <Button size="lg" className="w-full sm:w-auto rounded-xl gap-2 h-12 px-6 text-base shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all">
                Get Started <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/apply">
              <Button size="lg" variant="outline" className="w-full sm:w-auto rounded-xl h-12 px-6 text-base">
                Apply as Driver
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main>
        {/* Features Section */}
        <section className="py-16 sm:py-24 px-4">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12 sm:mb-16">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-4 tracking-tight">
                Everything You Need to Run Your Fleet
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto text-sm sm:text-base">
                Powerful tools designed specifically for trucking companies of all sizes.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {features.map((feature, index) => (
                <div
                  key={feature.title}
                  className="group p-5 sm:p-6 rounded-2xl border bg-card hover:shadow-lg hover:border-primary/20 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-lg sm:text-xl font-semibold text-card-foreground mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm sm:text-base text-muted-foreground">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Partners Section */}
        <section className="py-16 sm:py-24 px-4 bg-muted/30">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12 sm:mb-16">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-4 tracking-tight">
                Our Integration Partners
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto text-sm sm:text-base">
                Seamlessly connected with industry-leading platforms to power your operations.
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
              {partners.map((partner, index) => (
                <div
                  key={partner.name}
                  className="group p-4 sm:p-6 rounded-2xl border bg-card hover:shadow-md hover:border-primary/30 transition-all duration-300 text-center animate-in fade-in slide-in-from-bottom-4"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform duration-300">
                    <span className="text-lg sm:text-xl font-bold text-primary">
                      {partner.name.charAt(0)}
                    </span>
                  </div>
                  <h3 className="font-semibold text-card-foreground text-sm sm:text-base">{partner.name}</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground">{partner.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 sm:py-24 px-4">
          <div className="max-w-4xl mx-auto">
            <div className="relative rounded-3xl bg-gradient-to-br from-primary to-primary/80 p-8 sm:p-12 text-center overflow-hidden">
              {/* Decorative elements */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
              
              <div className="relative">
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-4 tracking-tight">
                  Ready to Transform Your Fleet Operations?
                </h2>
                <p className="text-white/80 mb-8 max-w-xl mx-auto text-sm sm:text-base">
                  Join hundreds of trucking companies that trust NexusTech Solution to manage their operations efficiently.
                </p>
                <Link to="/auth">
                  <Button size="lg" variant="secondary" className="rounded-xl gap-2 h-12 px-6 text-base shadow-lg">
                    Start Today <ChevronRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-card border-t py-8 sm:py-12">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 justify-center sm:justify-start">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                <Truck className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-semibold text-foreground">NexusTech Solution</span>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground text-center">
              © {new Date().getFullYear()} NexusTech Solution. All rights reserved.
            </p>
            <div className="flex gap-6 justify-center">
              <Link to="/apply" className="text-xs sm:text-sm text-muted-foreground hover:text-primary transition-colors">
                Driver Application
              </Link>
              <Link to="/auth" className="text-xs sm:text-sm text-muted-foreground hover:text-primary transition-colors">
                Admin Portal
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
