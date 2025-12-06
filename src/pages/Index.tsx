import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Truck, MapPin, BarChart3, Users, Shield, Clock, ChevronRight } from "lucide-react";

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
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <Truck className="h-8 w-8 text-primary" />
              <span className="text-xl font-bold text-foreground">NexusTMS</span>
            </div>
            <div className="flex items-center gap-4">
              <Link to="/apply">
                <Button variant="ghost" size="sm">
                  Driver Application
                </Button>
              </Link>
              <Link to="/auth">
                <Button size="sm">
                  Admin Login
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="pt-32 pb-20 px-4 bg-gradient-to-b from-primary/5 to-background">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-6">
            Transportation Management
            <span className="block text-primary">Software</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
            Streamline your trucking operations with our all-in-one platform. 
            From dispatch to delivery, manage your fleet, drivers, and loads with ease.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/auth">
              <Button size="lg" className="gap-2">
                Get Started <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/apply">
              <Button size="lg" variant="outline">
                Apply as Driver
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main>
        {/* Features Section */}
        <section className="py-20 px-4">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                Everything You Need to Run Your Fleet
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Powerful tools designed specifically for trucking companies of all sizes.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {features.map((feature) => (
                <div
                  key={feature.title}
                  className="p-6 rounded-xl border bg-card hover:shadow-lg transition-shadow"
                >
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold text-card-foreground mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Partners Section */}
        <section className="py-20 px-4 bg-muted/30">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                Our Integration Partners
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Seamlessly connected with industry-leading platforms to power your operations.
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {partners.map((partner) => (
                <div
                  key={partner.name}
                  className="p-6 rounded-xl border bg-card hover:shadow-md transition-all hover:border-primary/50 text-center"
                >
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <span className="text-xl font-bold text-primary">
                      {partner.name.charAt(0)}
                    </span>
                  </div>
                  <h3 className="font-semibold text-card-foreground">{partner.name}</h3>
                  <p className="text-sm text-muted-foreground">{partner.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Ready to Transform Your Fleet Operations?
            </h2>
            <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
              Join hundreds of trucking companies that trust NexusTMS to manage their operations efficiently.
            </p>
            <Link to="/auth">
              <Button size="lg" className="gap-2">
                Start Today <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-card border-t py-12">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Truck className="h-6 w-6 text-primary" />
              <span className="font-semibold text-foreground">NexusTMS</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} NexusTMS. All rights reserved.
            </p>
            <div className="flex gap-4">
              <Link to="/apply" className="text-sm text-muted-foreground hover:text-primary">
                Driver Application
              </Link>
              <Link to="/auth" className="text-sm text-muted-foreground hover:text-primary">
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
